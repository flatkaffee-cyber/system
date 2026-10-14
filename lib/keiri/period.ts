// 月（YYYY-MM）から、freeeに渡す期間と会計年度を出す。
// flat.の会計年度は6/1〜翌5/31。freeeのfiscal_yearは期首の年。期首が変わったらここだけ直す。
export const FISCAL_START_MONTH = 6;

export type Period = {
  month: string;
  from: string;
  to: string;
  fiscalYear: number;
  calendarMonth: number;
};

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonth(s: string): boolean {
  return MONTH_RE.test(s);
}

export function periodOf(month: string): Period {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error(`月の形式が違います: ${month}`);
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const last = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  return {
    month,
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
    fiscalYear: mm >= FISCAL_START_MONTH ? y : y - 1,
    calendarMonth: mm,
  };
}

export function shiftMonth(month: string, delta: number): string {
  const p = periodOf(month);
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), p.calendarMonth - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function jstMonth(now: number = Date.now()): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 7);
}

/** freeeが「その会計期間がない」（1期目より前など）と返したエラーか */
export function isMissingPeriodError(message: string): boolean {
  return /会計期間がありません/.test(message);
}
