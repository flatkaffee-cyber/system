import { PATTERNS, STAFF, toMin } from "@/lib/shift";
import { dateOfWeekday, type Submission } from "@/lib/shiftRequest";

// 希望を見て、1週間ぶんのシフトを自動で組む。
//
// これまでは曜日ごとに「誰がどの枠」まで決め打ちしていたので、
// 希望と合わない週は全部手で直すことになっていた。
// ここでは「埋めたい枠」だけを決めて、誰を入れるかは毎週その週の希望から選ぶ。
//
// 組んだ結果はあくまで下書き。画面で人と時間を直してから保存する。

/** その曜日に埋めたい枠。staffは決めない */
export type SlotDef = { label: string; start: string; end: string };

const p = (label: string): SlotDef => {
  const f = PATTERNS.find((x) => x.label === label);
  if (!f) throw new Error(`パターン「${label}」がありません`);
  return { label: f.label, start: f.start, end: f.end };
};

/** 曜日ごとに必要な枠。0=日。火曜は定休日なので空 */
export function slotsFor(weekday: number): SlotDef[] {
  if (weekday === 2) return [];
  if (weekday === 6) return [p("土曜昼"), p("土曜夜")];
  return [p("朝番"), p("昼番"), p("夜番")];
}

/** 定休日かどうか */
export const isClosed = (weekday: number) => slotsFor(weekday).length === 0;

/** その人がその時間に入れるか（希望が枠を完全に覆っているか） */
export function canWork(sub: Submission | undefined, weekday: number, slot: SlotDef): boolean {
  if (!sub) return false;
  const s = toMin(slot.start);
  const e = toMin(slot.end);
  if (s === null || e === null) return false;
  return sub.slots.some((x) => {
    const a = toMin(x.start);
    const b = toMin(x.end);
    return a !== null && b !== null && x.weekday === weekday && a <= s && e <= b;
  });
}

export type PlannedSlot = SlotDef & {
  date: string;
  weekday: number;
  /** 入れられる人 */
  candidates: string[];
  /** 自動で選んだ人。誰も入れないときは null */
  staff: string | null;
};

export type PlannedDay = {
  date: string;
  weekday: number;
  closed: boolean;
  slots: PlannedSlot[];
};

const mins = (s: SlotDef) => (toMin(s.end) ?? 0) - (toMin(s.start) ?? 0);

/**
 * 1週間ぶんの割り当てを決める。
 *
 * 選び方は
 *   1. その枠に入れる人だけを候補にする
 *   2. その週の合計時間がいちばん短い人を選ぶ（偏らないように）
 *   3. 同じ日に続けて入るのは避ける（通しで長時間にならないように）
 *   4. 前の日の夜番だった人の翌朝は避ける（閉めた人が翌朝開けない）
 * 同点なら人の並び順で決める。毎回同じ結果になるようにしておく。
 */
export function planWeek(
  week: string,
  submissions: Record<string, Submission>,
  staffList: readonly string[] = STAFF.filter((s) => s !== "バイト"),
): { days: PlannedDay[]; unfilled: PlannedSlot[] } {
  const worked: Record<string, number> = Object.fromEntries(staffList.map((s) => [s, 0]));
  // 日付 → その日に入った人（同じ日の連続を避けるため）
  const sameDay: Record<string, Set<string>> = {};
  // 前日の夜番だった人
  let closedYesterday: string | null = null;

  const days: PlannedDay[] = [];
  // 月曜から日曜の順に見る
  for (const weekday of [1, 2, 3, 4, 5, 6, 0]) {
    const date = dateOfWeekday(week, weekday);
    const defs = slotsFor(weekday);
    const slots: PlannedSlot[] = [];
    let closesToday: string | null = null;

    for (const def of defs) {
      const candidates = staffList.filter((s) => canWork(submissions[s], weekday, def));
      const pick =
        [...candidates].sort((a, b) => {
          const pen = (n: string) =>
            (sameDay[date]?.has(n) ? 1 : 0) * 1000 +
            (def.label === "朝番" && closedYesterday === n ? 1 : 0) * 2000;
          const d = worked[a] + pen(a) - (worked[b] + pen(b));
          if (d !== 0) return d;
          return staffList.indexOf(a) - staffList.indexOf(b);
        })[0] ?? null;

      if (pick) {
        worked[pick] += mins(def);
        (sameDay[date] ??= new Set()).add(pick);
        if (def.label === "夜番" || def.label === "土曜夜") closesToday = pick;
      }
      slots.push({ ...def, date, weekday, candidates, staff: pick });
    }
    closedYesterday = closesToday;
    days.push({ date, weekday, closed: defs.length === 0, slots });
  }

  return { days, unfilled: days.flatMap((d) => d.slots).filter((s) => !s.staff) };
}

/** 下書きを、保存できる形に変える */
export function toEntries(days: PlannedDay[]) {
  return days
    .flatMap((d) => d.slots)
    .filter((s) => s.staff)
    .map((s) => ({
      date: s.date,
      staff: s.staff as string,
      start: s.start,
      end: s.end,
    }));
}
