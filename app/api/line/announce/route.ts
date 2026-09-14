import { NextRequest, NextResponse } from "next/server";
import { eventMessage, eventCarousel } from "@/lib/lineEvents";
import { eventOf } from "@/lib/events";
import { getEntries } from "@/lib/eventEntries";

export const runtime = "nodejs";
export const maxDuration = 60;

// 公式LINEの友だち全員にイベントを告知する（ブロードキャスト）。
//
// 「申込済みの人を外して送る」はナローキャストが要るが、
// LINE側の制限で最終的な配信対象が50人以上ないと送れない。
// flat.の友だちは50人以下なので使えない。
// なので全員に1通送り、申込済みの人が読んでも自然な文面で吸収する。
//
// 通数は「メッセージ数 × 人数」で数えられる。
// テキストとFlexを両方入れると1人あたり2通になるので、既定はFlexだけ。

const API = "https://api.line.me/v2/bot";

function token(): string {
  return process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
}

async function lineGet<T>(path: string): Promise<T | null> {
  const t = token();
  if (!t) return null;
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${t}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** 友だち数。insightは前日以前しか返らないので2日前まで遡って探す */
async function followerCount(): Promise<number | null> {
  for (let back = 1; back <= 3; back++) {
    const d = new Date(Date.now() + 9 * 3600 * 1000 - back * 86400 * 1000);
    const ymd = d.toISOString().slice(0, 10).replaceAll("-", "");
    const r = await lineGet<{ status?: string; followers?: number }>(
      `/insight/followers?date=${ymd}`,
    );
    if (r?.status === "ready" && typeof r.followers === "number") return r.followers;
  }
  return null;
}

// GET /api/line/announce?slug=djnight
//   送る前の確認。友だち数・今月の残り通数・申込済み人数を返す。
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") || "";
  const [followers, quota, consumption] = await Promise.all([
    followerCount(),
    lineGet<{ type?: string; value?: number }>("/message/quota"),
    lineGet<{ totalUsage?: number }>("/message/quota/consumption"),
  ]);

  const entries = slug ? await getEntries(slug) : [];
  const limit = quota?.value ?? null;
  const used = consumption?.totalUsage ?? null;

  return NextResponse.json({
    event: slug ? (eventOf(slug)?.title ?? "知らないイベント") : null,
    followers,
    entries: entries.length,
    quota: { limit, used, left: limit != null && used != null ? limit - used : null },
    // 1メッセージあたりの見込み通数
    costPerMessage: followers,
    note:
      "ブロードキャストは全員に届く。申込済みの人だけ外すことはできない（ナローキャストは配信対象50人以上が必要）",
  });
}

// POST /api/line/announce { slug, text?, dryRun?: true }
//   dryRun を明示的に false にしたときだけ実際に送る。
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      slug?: string;
      text?: string;
      /** イベントのカードを付けるか。既定は付ける */
      card?: boolean;
      dryRun?: boolean;
    };
    const dryRun = b.dryRun !== false;
    const withCard = b.card !== false;

    const messages: unknown[] = [];
    if (b.text?.trim()) messages.push({ type: "text", text: b.text.trim() });
    if (withCard) {
      const card = b.slug ? eventMessage(b.slug) : eventCarousel();
      if (!card) {
        return NextResponse.json(
          { error: `知らないイベントです: ${b.slug}` },
          { status: 400 },
        );
      }
      messages.push(card);
    }
    if (messages.length === 0) {
      return NextResponse.json(
        { error: "text か card のどちらかは必要です" },
        { status: 400 },
      );
    }

    const followers = await followerCount();
    const estimate = followers != null ? followers * messages.length : null;

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        messages,
        followers,
        estimatedMessages: estimate,
        hint: "本当に送るときは dryRun:false を付けてください",
      });
    }

    const t = token();
    if (!t) {
      return NextResponse.json(
        { error: "LINE_CHANNEL_ACCESS_TOKEN が未設定" },
        { status: 500 },
      );
    }
    const res = await fetch(`${API}/message/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ messages }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `送信に失敗(${res.status})`, details: (await res.text()).slice(0, 400) },
        { status: res.status },
      );
    }
    return NextResponse.json({ ok: true, sent: messages.length, estimatedMessages: estimate });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "送信に失敗" },
      { status: 500 },
    );
  }
}
