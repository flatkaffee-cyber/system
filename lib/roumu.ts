// 労務 › 給与 の計算。役員報酬と社会保険料（健康保険・子ども子育て支援金・厚生年金）。
// 2026-10-30 年金事務所の通知書（R8.10.14付）が届いたので作った。
// 数字は通知書と協会けんぽ滋賀の料率から。料率が変わったら RATES を、報酬が変わったら MEMBERS を直す。

export type Member = {
  name: string;
  /** 毎月の役員報酬 */
  pay: number;
  /** 健康保険の標準報酬月額 */
  stdHealth: number;
  /** 厚生年金の標準報酬月額 */
  stdPension: number;
  /** 社会保険に入った月（YYYY-MM） */
  since: string;
};

export const MEMBERS: Member[] = [
  { name: "坂本", pay: 62999, stdHealth: 58000, stdPension: 88000, since: "2026-09" },
  { name: "櫻井", pay: 62999, stdHealth: 58000, stdPension: 88000, since: "2026-09" },
  { name: "町田", pay: 62999, stdHealth: 58000, stdPension: 88000, since: "2026-09" },
];

export const RATES = {
  label: "協会けんぽ滋賀 令和8年度（2026年3月分から）",
  health: 0.0988,
  /** 子ども・子育て支援金（2026年4月分から） */
  support: 0.0023,
  pension: 0.183,
  /** 子ども・子育て拠出金。会社だけが払う */
  contribution: 0.0036,
};

/** 給料から引く本人負担の端数。50銭以下は切り捨て、50銭を超えたら切り上げ */
export const roundEmployee = (x: number) => {
  const yen = Math.floor(x);
  return x - yen > 0.5 + 1e-9 ? yen + 1 : yen;
};

export type Premium = {
  health: number;
  support: number;
  pension: number;
  /** 本人負担の合計（報酬から引く額） */
  employee: number;
  /** 1人分の保険料の全額（会社と本人の合計、拠出金を含む。端数そのまま） */
  full: number;
};

export function premium(m: Member, r = RATES): Premium {
  const health = roundEmployee((m.stdHealth * r.health) / 2);
  const support = roundEmployee((m.stdHealth * r.support) / 2);
  const pension = roundEmployee((m.stdPension * r.pension) / 2);
  const full =
    m.stdHealth * r.health + m.stdHealth * r.support + m.stdPension * r.pension + m.stdPension * r.contribution;
  return { health, support, pension, employee: health + support + pension, full };
}

/** 1か月に会社が年金事務所に払う額。種類ごとに全員分を足して円未満を切り捨てる */
export function monthlyPayment(members = MEMBERS, r = RATES) {
  const sum = (f: (m: Member) => number) => Math.floor(members.reduce((s, m) => s + f(m), 0) + 1e-9);
  const health = sum((m) => m.stdHealth * r.health);
  const support = sum((m) => m.stdHealth * r.support);
  const pension = sum((m) => m.stdPension * r.pension);
  const contribution = sum((m) => m.stdPension * r.contribution);
  const total = health + support + pension + contribution;
  const employee = members.reduce((s, m) => s + premium(m, r).employee, 0);
  return { health, support, pension, contribution, total, employee, employer: total - employee };
}

/** 源泉所得税（月額表・甲欄）。88,000円未満は0円。それ以上はまだ表を入れていないので null */
export const withholding = (taxable: number): number | null => (taxable < 88000 ? 0 : null);

/** YYYY-MM を n か月ずらす */
export function addMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 土日なら次の月曜にずらす（祝日は見ていない） */
export function nextWeekday(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** その月の保険料を払う日＝翌月の末日（土日なら次の平日） */
export function dueDate(insMonth: string) {
  const next = addMonth(insMonth, 1);
  const [y, m] = next.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return nextWeekday(`${next}-${String(last).padStart(2, "0")}`);
}

/** 実際の払い方が決まりと違った月。支給月 → メモ */
export const EXCEPTIONS: Record<string, { skipped: boolean; note: string }> = {
  "2026-10": {
    skipped: true,
    note: "9月分の保険料を引かずに満額で払った。9月分（1人 ¥10,984）は本人から返してもらう（やり方は未定）",
  },
};

export type PayRow = {
  name: string;
  pay: number;
  /** 引いた保険料の月（なければ null） */
  insMonth: string | null;
  health: number;
  support: number;
  pension: number;
  tax: number | null;
  net: number;
};

/**
 * 支給月の明細。報酬から引けるのは「前月分」の保険料だけ（健康保険法167条・厚生年金保険法84条）。
 * EXCEPTIONS の月は、実際に引かなかったとおりに出す。
 */
export function payroll(month: string, members = MEMBERS, r = RATES): PayRow[] {
  const prev = addMonth(month, -1);
  const skipped = EXCEPTIONS[month]?.skipped ?? false;
  return members.map((m) => {
    const covered = prev >= m.since && !skipped;
    const p = premium(m, r);
    const health = covered ? p.health : 0;
    const support = covered ? p.support : 0;
    const pension = covered ? p.pension : 0;
    const taxable = m.pay - health - support - pension;
    const tax = withholding(taxable);
    return {
      name: m.name,
      pay: m.pay,
      insMonth: covered ? prev : null,
      health,
      support,
      pension,
      tax,
      net: taxable - (tax ?? 0),
    };
  });
}

/** 報酬を払い始めた月 */
export const FIRST_PAY_MONTH = "2026-09";
