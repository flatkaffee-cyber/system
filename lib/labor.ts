// 労働枠（各役員が労働時間に応じて経費として使える枠）のロジック。
// 勤怠シートの 出勤/退勤/休憩 から労働時間を計算し、時給1,080円で「稼いだ枠」を出す。

export const HOURLY_RATE = 1080;
export const KINTAI_SHEET_ID = "1BP40iRpZNftPAggcvnpmNa1204O2zqQW9A-uV6pMzB4";
export const KINTAI_RANGE = "勤怠!A2:F2000";
export const MEMBERS = ["坂本", "町田", "櫻井", "國仲"] as const;
export type Member = (typeof MEMBERS)[number];

// 勤怠シートの表示名 → 役員名（Sho/kankichiは仮。違えばここを直すだけ）
const NAME_MAP: [string, Member][] = [
  ["坂本", "坂本"],
  ["Tatsuro", "坂本"],
  ["國仲", "國仲"],
  ["杏", "國仲"],
  ["Anne", "國仲"],
  ["櫻井", "櫻井"],
  ["Sho", "櫻井"], // 仮
  ["町田", "町田"],
  ["kankichi", "町田"], // 仮
];

export function mapName(raw: string): Member | null {
  const s = String(raw ?? "");
  for (const [key, member] of NAME_MAP) if (s.includes(key)) return member;
  return null;
}

// "H:MM" / "HH:MM" を分に変換。数値(シリアル日付=1日の割合)にも対応。空/不正はnull。
function toMinutes(v: string | number | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") {
    if (v > 0 && v < 2) return Math.round(v * 24 * 60); // シリアル時刻
    return null;
  }
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v).trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export type MemberHours = { hours: number; days: number };

// 行[日付,名前,出勤,退勤,休憩,労働時間] から、出勤/退勤/休憩で労働時間を再計算し名前別集計
export function computeHours(rows: (string | number)[][]): Record<string, MemberHours> {
  const out: Record<string, MemberHours> = {};
  for (const r of rows) {
    const member = mapName(String(r[1] ?? ""));
    if (!member) continue;
    const inMin = toMinutes(r[2]);
    const outMin = toMinutes(r[3]);
    if (inMin === null || outMin === null) continue; // 退勤未入力はスキップ
    let diff = outMin - inMin;
    if (diff < 0) diff += 24 * 60; // 日跨ぎ
    const brk = Number(r[4]) || 0;
    const work = (diff - brk) / 60;
    if (!isFinite(work) || work <= 0) continue;
    if (!out[member]) out[member] = { hours: 0, days: 0 };
    out[member].hours += Math.round(work * 10) / 10;
    out[member].days += 1;
  }
  // 端数整理
  for (const k of Object.keys(out)) out[k].hours = Math.round(out[k].hours * 10) / 10;
  return out;
}
