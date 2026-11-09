import { NextRequest, NextResponse } from "next/server";
import { GET as openingGET } from "@/app/api/opening/route";
import { getShifts } from "@/lib/shift";
import { getStaffLineIds, pushLine } from "@/lib/staffLine";
import {
  alreadySent,
  CHECK_TIMES,
  lineQuotaLeft,
  markSent,
  phaseNow,
  QUOTA_RESERVE,
  remindText,
  staffOnShift,
  type RemindPhase,
} from "@/lib/checkRemind";

export const runtime = "nodejs";
export const maxDuration = 60;

// 業務チェックの声かけ（lib/checkRemind）。
// cron が 10:30・16:30・18:30・翌1:00（日本時間）に呼ぶ。
//
// 手で確かめるとき:
//   ?phase=朝&date=2026-11-09 … 区分と日を決めて見る
//   ?dry=1                     … 送らずに、誰に何を送るかだけ返す
//   ?force=1                   … 送った記録があっても送る

type CheckTask = { phase: string; name: string; done: boolean; due?: boolean };

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const dry = sp.get("dry") === "1";
    const force = sp.get("force") === "1";
    const asked = sp.get("phase") as RemindPhase | null;
    const now = phaseNow();
    const phase = asked && asked in CHECK_TIMES ? asked : now?.phase;
    const date = sp.get("date") || now?.date;
    if (!phase || !date) {
      return NextResponse.json({ skipped: true, reason: "確認する時刻ではありません" });
    }
    if (!dry && !force && (await alreadySent(date, phase))) {
      return NextResponse.json({ skipped: true, reason: "この区分はもう確認済み", date, phase });
    }

    // 業務チェックの画面と同じ判定で、その日にやる作業のうち終わっていないもの
    const res = await openingGET(new NextRequest(new URL(`/api/opening?date=${date}`, req.nextUrl.origin)));
    const data = (await res.json()) as { tasks?: CheckTask[]; error?: string };
    if (!data.tasks) throw new Error(data.error || "業務チェックが読めません");
    const left = data.tasks
      .filter((t) => t.phase === phase && (t.due === undefined || t.due) && !t.done)
      .map((t) => t.name);

    const staff = staffOnShift(await getShifts(), date, phase);
    const base = { date, phase, left, staff };
    if (left.length === 0 || staff.length === 0) {
      if (!dry) await markSent(date, phase, { ...base, sent: [] });
      return NextResponse.json({
        ok: true,
        ...base,
        sent: [],
        reason: left.length === 0 ? "全部終わっています" : "その時間にシフトの人がいません",
      });
    }

    const text = remindText(phase, date, left);
    if (dry) return NextResponse.json({ ok: true, dry: true, ...base, text });

    // 無料枠を使い切ると、イベントの告知が送れなくなる
    const quotaLeft = await lineQuotaLeft();
    if (quotaLeft != null && quotaLeft - staff.length < QUOTA_RESERVE) {
      await markSent(date, phase, { ...base, sent: [], skipped: "LINEの残りが少ない", quotaLeft });
      return NextResponse.json({ ok: true, ...base, sent: [], reason: `LINEの残りが${quotaLeft}通なので送らない`, quotaLeft });
    }

    const ids = await getStaffLineIds();
    const results: { name: string; ok: boolean; error?: string }[] = [];
    for (const name of staff) {
      const id = ids[name];
      if (!id) {
        results.push({ name, ok: false, error: "LINE未登録（勤怠のLINE打刻を一度開くと登録されます）" });
        continue;
      }
      try {
        await pushLine(id, text);
        results.push({ name, ok: true });
      } catch (e) {
        results.push({ name, ok: false, error: e instanceof Error ? e.message : "送信失敗" });
      }
    }
    await markSent(date, phase, { ...base, sent: results, at: new Date().toISOString() });
    return NextResponse.json({ ok: true, ...base, sent: results, quotaLeft });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
