import { NextRequest, NextResponse } from "next/server";
import { eventOf } from "@/lib/events";
import { getEntries } from "@/lib/eventEntries";
import {
  buildMessages,
  broadcast,
  followerCount,
  lineGet,
} from "@/lib/lineAnnounce";
import {
  addScheduled,
  listScheduled,
  removeScheduled,
  newId,
  type Scheduled,
} from "@/lib/announceSchedule";

export const runtime = "nodejs";
export const maxDuration = 60;

// 公式LINEの友だち全員にイベントを告知する。
// すぐ送るか、時刻を決めて予約するかを選べる。
// 予約したものは /api/cron/announce が毎正時に拾って送る。

// GET /api/line/announce?slug=djnight
//   送る前の確認。友だち数・今月の残り通数・申込済み人数・予約の一覧。
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") || "";
  const [followers, quota, consumption, scheduled] = await Promise.all([
    followerCount(),
    lineGet<{ type?: string; value?: number }>("/message/quota"),
    lineGet<{ totalUsage?: number }>("/message/quota/consumption"),
    listScheduled(),
  ]);

  const ev = slug ? eventOf(slug) : undefined;
  const entries = slug ? await getEntries(slug) : [];
  const limit = quota?.value ?? null;
  const used = consumption?.totalUsage ?? null;

  return NextResponse.json({
    scheduled,
    event: slug ? (ev?.title ?? "知らないイベント") : null,
    // 登録簿に書いてある告知の文面。画面の初期値にする
    text: ev?.announce ?? null,
    followers,
    entries: entries.length,
    quota: { limit, used, left: limit != null && used != null ? limit - used : null },
    costPerMessage: followers,
    note:
      "ブロードキャストは全員に届く。申込済みの人だけ外すことはできない（ナローキャストは配信対象50人以上が必要）",
  });
}

// POST /api/line/announce
//   { slug, text, dryRun?: true }        … 下書き確認／即送信
//   { slug, text, sendAt }               … 予約
//   { cancelId }                         … 予約の取消
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      slug?: string;
      text?: string;
      card?: boolean;
      dryRun?: boolean;
      sendAt?: string;
      cancelId?: string;
    };

    if (b.cancelId) {
      await removeScheduled(b.cancelId);
      return NextResponse.json({ ok: true, canceled: b.cancelId });
    }

    // 予約。ここでは送らず、cronが時刻を過ぎてから送る
    if (b.sendAt) {
      const at = Date.parse(b.sendAt);
      if (Number.isNaN(at)) {
        return NextResponse.json({ error: "送信時刻が読めません" }, { status: 400 });
      }
      if (!b.text?.trim()) {
        return NextResponse.json({ error: "文面が空です" }, { status: 400 });
      }
      // 組み立てられるかここで見ておく。当日になって失敗するのを防ぐ
      buildMessages(b.slug ?? "", b.text, b.card !== false);
      const s: Scheduled = {
        id: newId(),
        slug: b.slug ?? "",
        text: b.text.trim(),
        sendAt: new Date(at).toISOString(),
        createdAt: new Date().toISOString(),
      };
      await addScheduled(s);
      return NextResponse.json({ ok: true, scheduled: s });
    }

    const messages = buildMessages(b.slug ?? "", b.text ?? "", b.card !== false);
    const followers = await followerCount();
    const estimate = followers != null ? followers * messages.length : null;

    if (b.dryRun !== false) {
      return NextResponse.json({
        dryRun: true,
        messages,
        followers,
        estimatedMessages: estimate,
        hint: "本当に送るときは dryRun:false を付けてください",
      });
    }

    const r = await broadcast(messages);
    return NextResponse.json({ ok: true, sent: messages.length, estimatedMessages: r.count });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "送信に失敗" },
      { status: 500 },
    );
  }
}
