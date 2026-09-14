import { NextRequest, NextResponse } from "next/server";
import { buildMessages, broadcast } from "@/lib/lineAnnounce";
import { listScheduled, dueNow, markSent } from "@/lib/announceSchedule";

export const runtime = "nodejs";
export const maxDuration = 60;

// 予約された告知を送る。毎正時にVercelのcronが呼ぶ。
// 予約が無い時間帯は何もしないので、毎時走っても実害はない。
//
// 送信に失敗したら sentAt は入れず、理由だけ残す。次の正時にもう一度試す。

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "1";
  const list = await listScheduled();
  const due = force ? list.filter((s) => !s.sentAt) : dueNow(list);
  if (due.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const results: { id: string; ok: boolean; error?: string; count?: number | null }[] = [];
  for (const s of due) {
    try {
      const messages = buildMessages(s.slug, s.text);
      const r = await broadcast(messages);
      await markSent(s.id, { sentAt: new Date().toISOString(), count: r.count ?? undefined });
      results.push({ id: s.id, ok: true, count: r.count });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "送信失敗";
      await markSent(s.id, { error: msg });
      results.push({ id: s.id, ok: false, error: msg });
    }
  }
  return NextResponse.json({ ok: true, sent: results.filter((r) => r.ok).length, results });
}
