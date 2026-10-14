export const yen = (n: number) => `${n < 0 ? "−" : ""}¥${Math.abs(Math.round(n)).toLocaleString()}`;

/** 2026-10-05 → 10/05 */
export const md = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}`;

/** 2026-10 → 2026年10月 */
export const monthLabel = (m: string) => `${m.slice(0, 4)}年${Number(m.slice(5, 7))}月`;

export const TAG_LABEL = { card: "カード", bank: "銀行", cash: "現金", tatekae: "立替" } as const;
