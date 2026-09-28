import { NextRequest, NextResponse } from "next/server";
import {
  getSupporters,
  updateSupporter,
  removeSupporter,
  importSupporters,
  parseCsv,
  fillTemplate,
} from "@/lib/supporters";
import { gmailProfile, gmailSend, googleErrorPayload, isGoogleConnected } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 300;

// クラウドファンディングの支援者へのお礼メールと、コーヒーチケットの受け渡し。
//
// 送信は Google連携中のアカウントから行う。接続しているアカウントが
// flat.kaffee@gmail.com かどうかは画面で見せて、違えば繋ぎ直してもらう。

// GET → 一覧と、送信に使うアカウント
export async function GET() {
  const list = await getSupporters();
  let account: string | null = null;
  let connected = false;
  try {
    connected = await isGoogleConnected();
    if (connected) account = (await gmailProfile()).emailAddress;
  } catch {
    /* 未接続や期限切れは account=null のまま画面に出す */
  }
  return NextResponse.json({
    supporters: list,
    account,
    connected,
    counts: {
      all: list.length,
      sent: list.filter((s) => s.sentAt).length,
      redeemed: list.filter((s) => s.redeemedAt).length,
    },
  });
}

// POST
//   { csv, tickets }                     … CSVを取り込む
//   { action:"send", ids, subject, body } … お礼メールを送る
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      csv?: string;
      tickets?: number;
      action?: string;
      ids?: string[];
      subject?: string;
      body?: string;
    };

    if (b.csv !== undefined) {
      const { rows, skipped } = parseCsv(b.csv);
      if (rows.length === 0) {
        return NextResponse.json(
          { error: "メールアドレスの入った行が見つかりませんでした", skipped },
          { status: 400 },
        );
      }
      const r = await importSupporters(rows, Math.max(1, Number(b.tickets) || 1));
      return NextResponse.json({ ok: true, ...r, skipped });
    }

    if (b.action === "send") {
      if (!b.subject?.trim() || !b.body?.trim()) {
        return NextResponse.json({ error: "件名と本文が必要です" }, { status: 400 });
      }
      const list = await getSupporters();
      const targets = list.filter((s) => b.ids?.includes(s.id));
      if (targets.length === 0) {
        return NextResponse.json({ error: "送る相手が選ばれていません" }, { status: 400 });
      }
      const results: { id: string; name: string; ok: boolean; error?: string }[] = [];
      for (const s of targets) {
        // 送った人にもう一度送らない。取り込み直しても送信済みは残る
        if (s.sentAt) {
          results.push({ id: s.id, name: s.name, ok: false, error: "送信済み" });
          continue;
        }
        try {
          await gmailSend(s.email, fillTemplate(b.subject, s), fillTemplate(b.body, s));
          await updateSupporter(s.id, { sentAt: new Date().toISOString(), sendError: undefined });
          results.push({ id: s.id, name: s.name, ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "送信失敗";
          await updateSupporter(s.id, { sendError: msg });
          results.push({ id: s.id, name: s.name, ok: false, error: msg });
        }
      }
      return NextResponse.json({ ok: true, sent: results.filter((r) => r.ok).length, results });
    }

    return NextResponse.json({ error: "何をするか分かりません" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(googleErrorPayload(e, "処理に失敗"), { status: 500 });
  }
}

// PATCH { id, redeemed?, tickets?, note? } → 店頭で渡した記録など
export async function PATCH(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      id?: string;
      redeemed?: boolean;
      tickets?: number;
      note?: string;
    };
    if (!b.id) return NextResponse.json({ error: "id が必要です" }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (b.redeemed !== undefined) {
      patch.redeemedAt = b.redeemed ? new Date().toISOString() : undefined;
    }
    if (b.tickets !== undefined) patch.tickets = Math.max(0, Number(b.tickets) || 0);
    if (b.note !== undefined) patch.note = b.note;
    const s = await updateSupporter(b.id, patch);
    if (!s) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    return NextResponse.json({ ok: true, supporter: s });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新に失敗" },
      { status: 500 },
    );
  }
}

// DELETE { id }
export async function DELETE(req: NextRequest) {
  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 });
    await removeSupporter(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "削除に失敗" },
      { status: 500 },
    );
  }
}
