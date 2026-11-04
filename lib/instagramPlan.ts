// インスタの定期ストーリーの「今日のいつに何を出すか」を決める部分。
//
// 保存やAPIの呼び出しは lib/instagram.ts。ここは計算だけにして、テストで確かめられるようにする。
// 時刻はすべて日本時間で考える（cronはUTCで動くので、入口で直す）。

export type Frequency = "daily" | "weekly" | "monthly" | "custom";

export type StoryRule = {
  id: string;
  /** 画面に出す名前（例: 朝のオープン、ランニング） */
  name: string;
  enabled: boolean;
  frequency: Frequency;
  /** weekly のとき。0=日 … 6=土 */
  weekdays: number[];
  /** monthly のとき。1〜31。その月に無い日（2月30日など）は飛ばす */
  monthDays: number[];
  /** custom のとき。YYYY-MM-DD */
  dates: string[];
  /** 出す時刻と、そのとき上げる画像。画像が複数なら順に続けて上げる */
  slots: { time: string; imageIds: string[] }[];
  /** 定休日と臨時休業の日は出さない */
  businessDaysOnly: boolean;
  /** 時刻の前に手で上げていたら、自動では出さない */
  skipIfPosted: boolean;
  /** 「手で上げた」とみなす幅（時刻の何分前から）。 */
  skipWindowMin: number;
  /** 期間。どちらも省略できる（YYYY-MM-DD） */
  startDate?: string;
  endDate?: string;
  /** Googleマップの投稿にも同じ画像を出す。ストーリーと違って本文が要る */
  google?: { enabled: boolean; summary: string };
  updatedAt: string;
};

/** 予定の時刻を過ぎてから何分までなら出すか。cronが遅れたり止まったりしても、昼過ぎに朝の分が出ないように */
export const LATE_LIMIT_MIN = 30;

export function jstNow(now = Date.now()): { date: string; minutes: number; weekday: number } {
  const d = new Date(now + 9 * 3600 * 1000);
  return {
    date: d.toISOString().slice(0, 10),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

export function toMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** その日が営業日か。定休日の曜日と、臨時休業の日付で判断する */
export function isBusinessDay(date: string, closedWeekday: number, closures: string[]): boolean {
  return weekdayOf(date) !== closedWeekday && !closures.includes(date);
}

/** その日にこの決まりのストーリーを出す日か（時刻は見ない） */
export function runsOn(
  rule: StoryRule,
  date: string,
  closedWeekday: number,
  closures: string[],
): boolean {
  if (!rule.enabled) return false;
  if (rule.startDate && date < rule.startDate) return false;
  if (rule.endDate && date > rule.endDate) return false;
  if (rule.businessDaysOnly && !isBusinessDay(date, closedWeekday, closures)) return false;
  switch (rule.frequency) {
    case "daily":
      return true;
    case "weekly":
      return rule.weekdays.includes(weekdayOf(date));
    case "monthly":
      return rule.monthDays.includes(Number(date.slice(8, 10)));
    case "custom":
      return rule.dates.includes(date);
  }
}

/** 実行の記録を引く鍵。同じ日の同じ時刻は1回だけ出す */
export function runKey(ruleId: string, date: string, time: string): string {
  return `${ruleId}|${date}|${time}`;
}

/**
 * いま出すべきもの。時刻を過ぎていて、LATE_LIMIT_MIN 以内で、まだ記録が無いもの。
 * done は runKey の集合。
 */
export function dueSlots(
  rules: StoryRule[],
  now: { date: string; minutes: number },
  closedWeekday: number,
  closures: string[],
  done: Set<string>,
): { rule: StoryRule; time: string; imageIds: string[] }[] {
  const out: { rule: StoryRule; time: string; imageIds: string[] }[] = [];
  for (const rule of rules) {
    if (!runsOn(rule, now.date, closedWeekday, closures)) continue;
    for (const slot of rule.slots) {
      const t = toMin(slot.time);
      if (t === null || slot.imageIds.length === 0) continue;
      if (now.minutes < t || now.minutes - t > LATE_LIMIT_MIN) continue;
      if (done.has(runKey(rule.id, now.date, slot.time))) continue;
      out.push({ rule, time: slot.time, imageIds: slot.imageIds });
    }
  }
  return out;
}

/**
 * 時刻の前に、手で上げたストーリーがあるか。
 * 自動で上げたもの（ownIds）は数えない。同じ時刻に別の決まりが先に出しても、こちらを止めないため。
 */
export function postedManually(
  stories: { id: string; timestamp: string }[],
  ownIds: Set<string>,
  date: string,
  time: string,
  windowMin: number,
): boolean {
  const t = toMin(time);
  if (t === null) return false;
  // 日本時間の「その日のその時刻」をUTCのミリ秒に直す
  const slotAt = Date.parse(`${date}T00:00:00+09:00`) + t * 60_000;
  const from = slotAt - windowMin * 60_000;
  return stories.some((s) => {
    if (ownIds.has(s.id)) return false;
    const at = Date.parse(s.timestamp);
    return Number.isFinite(at) && at >= from && at <= slotAt + LATE_LIMIT_MIN * 60_000;
  });
}

/** 一覧に出す「次はいつ」。今日から60日先まで探す */
export function nextRun(
  rule: StoryRule,
  now: { date: string; minutes: number },
  closedWeekday: number,
  closures: string[],
): { date: string; time: string } | null {
  const times = rule.slots
    .filter((s) => s.imageIds.length > 0 && toMin(s.time) !== null)
    .map((s) => s.time)
    .sort((a, b) => (toMin(a)! - toMin(b)!));
  if (times.length === 0) return null;
  const base = Date.parse(`${now.date}T00:00:00Z`);
  for (let i = 0; i < 60; i++) {
    const date = new Date(base + i * 86400_000).toISOString().slice(0, 10);
    if (!runsOn(rule, date, closedWeekday, closures)) continue;
    const t = i === 0 ? times.find((x) => toMin(x)! >= now.minutes) : times[0];
    if (t) return { date, time: t };
  }
  return null;
}
