// 取り込みの状態から「古いか」「LINE で知らせるか」「再接続が要るか」を決める純粋な関数。
// 画面（クライアント）からも使うので、Node の機能は使わない。

export type SyncState = {
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  alertedAt: string | null;
};

export const STALE_MINUTES = 15;
export const ALERT_MINUTES = 60;

const minutesSince = (iso: string, nowMs: number) => (nowMs - Date.parse(iso)) / 60_000;

/** 最後の成功から15分を超えた（一度も成功していない）*/
export function isStale(s: SyncState, nowMs: number): boolean {
  return !s.lastSuccessAt || minutesSince(s.lastSuccessAt, nowMs) > STALE_MINUTES;
}

/**
 * まだ知らせていなくて、最後の成功から60分以上たった（エラーの記録の有無は問わない。
 * 時間切れで打ち切られると記録が残らないため）。一度も成功していないときは、エラーが記録されていれば知らせる
 */
export function shouldAlert(s: SyncState, nowMs: number): boolean {
  if (s.alertedAt) return false;
  if (!s.lastSuccessAt) return !!s.lastError;
  return minutesSince(s.lastSuccessAt, nowMs) >= ALERT_MINUTES;
}

/** freee につなぎ直さないと直らないエラーか */
export function needsReconnect(lastError: string | null): boolean {
  return !!lastError && /未接続|トークン/.test(lastError);
}

/** 2026-10-16T01:35:00Z → 10/16 10:35（JST） */
export function stamp(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 3600_000).toISOString();
  return `${d.slice(5, 7)}/${d.slice(8, 10)} ${d.slice(11, 16)}`;
}

/**
 * 取り込めない状態が続いているときの LINE の文言。
 * リンクは /keiri（API に直接飛ぶと、LINE の中のブラウザでは合言葉が無く開けない）。経理画面の帯から再接続できる
 */
export function alertMessage(s: SyncState, base: string): string {
  return [
    `【flat. 経理】freee から取り込めていません（最終 ${s.lastSuccessAt ? stamp(s.lastSuccessAt) : "なし"}）`,
    (s.lastError ?? "原因の記録がありません（途中で止まった可能性があります）").slice(0, 80),
    `経理画面: ${base}/keiri`,
  ].join("\n");
}
