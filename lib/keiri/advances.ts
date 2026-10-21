// 立替（役員借入金）の人ごとの残りと、毎月の返済予定。
// freee の貸借の試算表（取引先の内訳つき）から出す。立替の画面（/kariire）と経理のお知らせで使う。
// 純粋な関数。実行時に他のファイルを import しない（テストから .ts 付きで読むため）。
import type { TrialBsBalance } from "../freeeMirror/source";

/** freee の取引先名 → 人。システムの立替は短い名前、手で作った返済は長い名前で入っている */
export const PERSON_OF_PARTNER: Record<string, string> = {
  坂本: "坂本",
  坂本達郎: "坂本",
  櫻井: "櫻井",
  櫻井勘吉: "櫻井",
  町田: "町田",
  町田創: "町田",
  國仲: "國仲",
};

/**
 * 取引先が「未選択」の立替の持ち主。freee では取引先を付けられない形で入っている
 * （期首残高の設立登記 60,000、プライベート資金で払った 6/1 の 440 と temu 2,919）。
 * 2026-10-21 坂本さんに確認。合計より未選択の残高が多い分は「（取引先なし）」で出す
 */
export const UNASSIGNED_OWNERS: { person: string; amount: number }[] = [
  { person: "坂本", amount: 60440 },
  { person: "國仲", amount: 2919 },
];

export const UNASSIGNED = "（取引先なし）";

export type Advance = { person: string; advanced: number; repaid: number; balance: number };

/** 役員借入金の取引先ごとの動きを、人ごとの「立て替えた額・返した額・残り」にまとめる。残りの多い順 */
export function advancesByPerson(balances: TrialBsBalance[], accountItemId: number): Advance[] {
  const row = balances.find((b) => b.account_item_id === accountItemId);
  const acc = new Map<string, Advance>();
  const add = (person: string, advanced: number, repaid: number) => {
    const a = acc.get(person) ?? { person, advanced: 0, repaid: 0, balance: 0 };
    a.advanced += advanced;
    a.repaid += repaid;
    a.balance = a.advanced - a.repaid;
    acc.set(person, a);
  };
  for (const p of row?.partners ?? []) {
    const advanced = (p.opening_balance ?? 0) + (p.credit_amount ?? 0);
    const repaid = p.debit_amount ?? 0;
    if (p.id === 0) {
      let rest = advanced;
      for (const o of UNASSIGNED_OWNERS) {
        const take = Math.min(o.amount, rest);
        if (take > 0) add(o.person, take, 0);
        rest -= take;
      }
      if (rest !== 0 || repaid !== 0) add(UNASSIGNED, rest, repaid);
      continue;
    }
    add(PERSON_OF_PARTNER[p.name] ?? p.name, advanced, repaid);
  }
  return [...acc.values()].sort((a, b) => b.balance - a.balance);
}

export type Payment = { date: string; amount: number; remaining: number };

/** 次の返済日（毎月 day 日）。今日がその日より前なら今月、当日以降なら来月 */
export function nextPayday(today: string, day: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const [yy, mm] = d < day ? [y, m] : m === 12 ? [y + 1, 1] : [y, m + 1];
  return `${yy}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 残りを毎月 monthly ずつ返したときの予定。最後の回は端数 */
export function repaymentPlan(balance: number, opts: { monthly: number; day: number; today: string }): Payment[] {
  const out: Payment[] = [];
  if (balance <= 0 || opts.monthly <= 0) return out;
  let rest = balance;
  let date = nextPayday(opts.today, opts.day);
  while (rest > 0 && out.length < 240) {
    const amount = Math.min(opts.monthly, rest);
    rest -= amount;
    out.push({ date, amount, remaining: rest });
    date = nextPayday(date, opts.day);
  }
  return out;
}
