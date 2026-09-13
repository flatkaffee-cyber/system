import { NextRequest, NextResponse } from "next/server";
import {
  STAFF,
  getShifts,
  upsertShifts,
  deleteShifts,
  newId,
  toMin,
  type ShiftEntry,
} from "@/lib/shift";
import { getWeek, mondayOf, nextWeekMonday, dateOfWeekday } from "@/lib/shiftRequest";
import { planWeek } from "@/lib/shiftPlan";

export const runtime = "nodejs";

// 週のシフトを組む画面の裏側。
// 希望（/shift-submit）から下書きを作って返し、直したものを保存する。

const ASSIGNABLE = STAFF.filter((s) => s !== "バイト");

const weekDates = (week: string) =>
  [1, 2, 3, 4, 5, 6, 0].map((w) => dateOfWeekday(week, w));

// GET /api/shift-build?week=2026-09-14
//   希望・いまの割当・自動で組んだ下書きを返す
export async function GET(req: NextRequest) {
  try {
    const week = mondayOf(req.nextUrl.searchParams.get("week") || nextWeekMonday());
    const [submissions, all] = await Promise.all([getWeek(week), getShifts()]);
    const dates = new Set(weekDates(week));
    const current = all.filter((e) => dates.has(e.date));

    const { days, unfilled } = planWeek(week, submissions, ASSIGNABLE);

    // 画面で「この人はこの時間なら入れる」を出すための材料
    const availability = Object.fromEntries(
      ASSIGNABLE.map((s) => [
        s,
        (submissions[s]?.slots ?? []).map((x) => ({
          weekday: x.weekday,
          start: x.start,
          end: x.end,
        })),
      ]),
    );

    return NextResponse.json({
      week,
      staff: ASSIGNABLE,
      submitted: ASSIGNABLE.filter((s) => submissions[s]),
      notSubmitted: ASSIGNABLE.filter((s) => !submissions[s]),
      availability,
      days,
      unfilled,
      current,
      hasCurrent: current.length > 0,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/shift-build
//   { week, entries: [{ date, staff, start, end }] }
//   その週の割当を、送られてきた内容でそっくり置き換える
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      week?: string;
      entries?: { date: string; staff: string; start: string; end: string }[];
    };
    if (!b.week) return NextResponse.json({ error: "週が必要です" }, { status: 400 });
    const week = mondayOf(b.week);
    const dates = new Set(weekDates(week));
    const list = b.entries ?? [];

    for (const e of list) {
      if (!dates.has(e.date)) {
        return NextResponse.json({ error: `${e.date} はこの週の外です` }, { status: 400 });
      }
      const s = toMin(e.start);
      const t = toMin(e.end);
      if (s === null || t === null) {
        return NextResponse.json({ error: "時刻は 9:00 の形で入れてください" }, { status: 400 });
      }
      if (t <= s) {
        return NextResponse.json(
          { error: `${e.date} の ${e.start}〜${e.end} は終わりが開始より前です` },
          { status: 400 },
        );
      }
    }

    // その週の今ある割当を消してから入れ直す。画面で消した枠を残さないため
    const all = await getShifts();
    const old = all.filter((e) => dates.has(e.date)).map((e) => e.id);
    if (old.length) await deleteShifts(old);

    const now = new Date().toISOString();
    const entries: ShiftEntry[] = list.map((e) => ({
      id: newId(),
      date: e.date,
      staff: e.staff,
      start: e.start,
      end: e.end,
      updatedAt: now,
    }));
    if (entries.length) await upsertShifts(entries);

    return NextResponse.json({ ok: true, week, saved: entries.length, removed: old.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}
