// freee の取り込みで「何を取るか」を決める純粋な関数。I/O はしない。
import { createHash } from "node:crypto";

export type MonthKeyed = {
  deals: { id: number; issue_date: string }[];
  journals: { id: number; issue_date: string }[];
  transfers: { id: number; date: string }[];
};

/** 月（YYYY-MM）ごとに、その月の取引・振替伝票・口座振替の中身のハッシュ。並び順には左右されない */
export function monthHashes(x: MonthKeyed): Record<string, string> {
  const byMonth = new Map<string, [string, number, string][]>();
  const add = (kind: string, id: number, date: string, row: unknown) => {
    const m = date.slice(0, 7);
    const list = byMonth.get(m) ?? [];
    list.push([kind, id, JSON.stringify(row)]);
    byMonth.set(m, list);
  };
  for (const d of x.deals) add("deal", d.id, d.issue_date, d);
  for (const j of x.journals) add("journal", j.id, j.issue_date, j);
  for (const t of x.transfers) add("transfer", t.id, t.date, t);
  const out: Record<string, string> = {};
  for (const [m, list] of byMonth) {
    list.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] < b[0] ? -1 : 1));
    out[m] = createHash("sha1").update(JSON.stringify(list)).digest("hex");
  }
  return out;
}

/**
 * 損益の試算表を取り直す月（昇順）。
 * 今月・先月（期内なら）・中身が変わった月・まだ保存していない月・freee が集計中だった月。毎晩は期首から今月まで全部。
 */
export function trialPlMonthsToRefresh(a: {
  fyMonths: string[];
  thisMonth: string;
  prevHashes: Record<string, string>;
  nextHashes: Record<string, string>;
  storedMonths: string[];
  notUpToDate: string[];
  nightly: boolean;
}): string[] {
  if (a.nightly) return [...a.fyMonths];
  const stored = new Set(a.storedMonths);
  const late = new Set(a.notUpToDate);
  const i = a.fyMonths.indexOf(a.thisMonth);
  const recent = new Set(i >= 0 ? a.fyMonths.slice(Math.max(0, i - 1), i + 1) : []);
  return a.fyMonths.filter(
    (m) => recent.has(m) || !stored.has(m) || late.has(m) || a.prevHashes[m] !== a.nextHashes[m],
  );
}

/** 毎晩の取り込みをする回か。JST 3時以降で、その日にまだやっていなければ */
export function needsNightly(lastNightlyDate: string | null, today: string, hour: number): boolean {
  return hour >= 3 && lastNightlyDate !== today;
}

export function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** 取り込みの間隔（分）。cron は毎分動き、書き込みの印が無ければこの間隔で取り込む */
export const SYNC_EVERY_MINUTES = 5;

/** 毎分の cron で取り込むか。書き込みの印がある、一度も動いていない、前回（成功か失敗の新しい方）から5分たった */
export function shouldRunCron(a: {
  dirty: boolean;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  nowMs: number;
}): boolean {
  if (a.dirty) return true;
  const last = Math.max(a.lastSuccessAt ? Date.parse(a.lastSuccessAt) : 0, a.lastErrorAt ? Date.parse(a.lastErrorAt) : 0);
  return !last || a.nowMs - last >= SYNC_EVERY_MINUTES * 60_000;
}

/** 同時に limit 本までで fn を回す。結果は xs の順 */
export async function mapLimit<T, R>(xs: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(xs.length);
  let next = 0;
  const worker = async () => {
    while (next < xs.length) {
      const i = next++;
      out[i] = await fn(xs[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, xs.length) }, worker));
  return out;
}
