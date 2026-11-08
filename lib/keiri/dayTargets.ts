// 日ごとの売上目標。月の目標（今月の成績）を、曜日の売れ方とイベントで日に割ったもの。
// 店（Square＋Uber）と、店の外の出店（えびす講など、freee に手で記帳する売上）を分けて持つ。
// node --test でそのまま動かすため、実行時に他のファイルを import しない。

export type DayTarget = {
  /** 店（Square＋Uber）の目標。店の中のイベント（ゲームナイトなど）はここに入れる */
  store: number;
  /** 店の外の出店などの目標。店とは別に数える */
  event?: number;
  /** その日の中身（ゲームナイト、ランニングクラブ、えびす講など） */
  label?: string;
  /** 定休日 */
  closed?: boolean;
};

export type DayTargetSum = {
  total: number;
  store: number;
  event: number;
  labels: string[];
  /** 目標のある営業日の数 */
  days: number;
  closedDays: number;
};

/** from〜to（YYYY-MM-DD、両端を含む）の目標を足す。目標が1つも無ければ null */
export function sumTargets(targets: Record<string, DayTarget>, from: string, to: string): DayTargetSum | null {
  const days = Object.keys(targets).filter((d) => d >= from && d <= to).sort();
  if (days.length === 0) return null;
  const s: DayTargetSum = { total: 0, store: 0, event: 0, labels: [], days: 0, closedDays: 0 };
  for (const d of days) {
    const t = targets[d];
    if (t.closed) {
      s.closedDays += 1;
      continue;
    }
    s.days += 1;
    s.store += t.store;
    s.event += t.event ?? 0;
    if (t.label && !s.labels.includes(t.label)) s.labels.push(t.label);
  }
  s.total = s.store + s.event;
  return s;
}
