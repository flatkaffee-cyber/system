// freeeの試算表（その月だけ）から損益計算書の形に並べる。
// その月の金額は closing_balance − opening_balance。収益・費用・各段の利益のどれもこの式で月の増減になる。
import type {
  FreeeDeal,
  FreeeJournal,
  PlAccount,
  PlEntry,
  PlLine,
  PlView,
  TrialPlBalance,
} from "./types";

export const TAX_RATE = 0.25; // 中小法人の実効税率の目安
export const KINTOWARI_MONTHLY = 5833; // 法人住民税の均等割 年70,000円 ÷ 12
export const OFFICER_ACCOUNT = "役員報酬";
export const LABOR_ACCOUNTS = ["給料手当", "雑給", "法定福利費"];
const COGS_CATEGORIES = ["期首商品棚卸", "当期商品仕入", "他勘定振替高(商)", "期末商品棚卸"];

export type PlInput = {
  balances: TrialPlBalance[];
  upToDate: boolean;
  deals: FreeeDeal[];
  journals: FreeeJournal[];
  accountNames: Map<number, string>;
};

const monthly = (b: TrialPlBalance) => b.closing_balance - b.opening_balance;

function total(bal: TrialPlBalance[], category: string): number {
  const b = bal.find((x) => x.total_line && x.account_category_name === category);
  return b ? monthly(b) : 0;
}

function itemAmount(bal: TrialPlBalance[], name: string): number {
  const b = bal.find((x) => !x.total_line && x.account_item_name === name);
  return b ? monthly(b) : 0;
}

/** 科目名 → その月の仕訳（借方プラス） */
function entriesByAccount(input: PlInput): Map<string, PlEntry[]> {
  const map = new Map<string, PlEntry[]>();
  const add = (
    name: string | undefined,
    e: Omit<PlEntry, "amount">,
    amount: number,
    side: "debit" | "credit",
  ) => {
    if (!name) return;
    const list = map.get(name) ?? [];
    list.push({ ...e, amount: side === "debit" ? amount : -amount });
    map.set(name, list);
  };
  for (const d of input.deals) {
    for (const x of d.details) {
      add(
        input.accountNames.get(x.account_item_id),
        { date: d.issue_date, description: x.description ?? "", sourceType: "deal", sourceId: d.id },
        x.amount,
        x.entry_side,
      );
    }
  }
  for (const j of input.journals) {
    for (const x of j.details) {
      add(
        input.accountNames.get(x.account_item_id),
        { date: j.issue_date, description: x.description ?? "", sourceType: "journal", sourceId: j.id },
        x.amount,
        x.entry_side,
      );
    }
  }
  for (const list of map.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return map;
}

function accountsUnder(
  bal: TrialPlBalance[],
  categories: string[],
  entries: Map<string, PlEntry[]>,
  creditPositive = false,
): PlAccount[] {
  return bal
    .filter((b) => !b.total_line && b.account_item_name && categories.includes(b.account_category_name ?? ""))
    .map((b) => {
      const name = b.account_item_name as string;
      const list = (entries.get(name) ?? []).map((e) => (creditPositive ? { ...e, amount: -e.amount } : e));
      return { name, amount: monthly(b), entries: list };
    })
    .filter((a) => a.amount !== 0 || a.entries.length > 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

export function buildPl(input: PlInput): PlView {
  const bal = input.balances;
  const entries = entriesByAccount(input);

  const sales = total(bal, "売上高");
  const cogs = total(bal, "売上原価");
  const gross = total(bal, "売上総損益金額");
  const sga = total(bal, "販売管理費");
  const operating = total(bal, "営業損益金額");
  const nonOpIncome = total(bal, "営業外収益");
  const nonOpExpense = total(bal, "営業外費用");
  const ordinary = total(bal, "経常損益金額");
  const extraGain = total(bal, "特別利益");
  const extraLoss = total(bal, "特別損失");
  const pretax = total(bal, "税引前当期純損益金額");
  const bookedTax = total(bal, "法人税等");
  const taxAdjust = total(bal, "法人税等調整額");

  const tax =
    bookedTax !== 0
      ? { amount: bookedTax, estimated: false }
      : { amount: (pretax > 0 ? Math.round(pretax * TAX_RATE) : 0) + KINTOWARI_MONTHLY, estimated: true };
  const netIncome = pretax - tax.amount - taxAdjust;
  const est = tax.estimated ? "（見込み）" : "";

  const lines: PlLine[] = [
    { key: "sales", label: "売上高", amount: sales, kind: "item", accounts: accountsUnder(bal, ["売上高"], entries, true) },
    { key: "cogs", label: "売上原価", amount: cogs, kind: "item", accounts: accountsUnder(bal, COGS_CATEGORIES, entries) },
    { key: "gross", label: "売上総利益（粗利）", amount: gross, kind: "subtotal" },
    { key: "sga", label: "販売費及び一般管理費", amount: sga, kind: "item", accounts: accountsUnder(bal, ["販売管理費"], entries) },
    { key: "operating", label: "営業利益", amount: operating, kind: "subtotal" },
    { key: "nonOpIncome", label: "営業外収益", amount: nonOpIncome, kind: "item", accounts: accountsUnder(bal, ["営業外収益"], entries, true) },
    { key: "nonOpExpense", label: "営業外費用", amount: nonOpExpense, kind: "item", accounts: accountsUnder(bal, ["営業外費用"], entries) },
    { key: "ordinary", label: "経常利益", amount: ordinary, kind: "subtotal" },
    { key: "extraGain", label: "特別利益", amount: extraGain, kind: "item", accounts: accountsUnder(bal, ["特別利益"], entries, true) },
    { key: "extraLoss", label: "特別損失", amount: extraLoss, kind: "item", accounts: accountsUnder(bal, ["特別損失"], entries) },
    { key: "pretax", label: "税引前当期純利益", amount: pretax, kind: "subtotal" },
    { key: "tax", label: `法人税等${est}`, amount: tax.amount, kind: "item" },
    { key: "net", label: `当期純利益${est}`, amount: netIncome, kind: "total" },
  ];

  return {
    lines,
    officerPay: itemAmount(bal, OFFICER_ACCOUNT),
    laborCost: LABOR_ACCOUNTS.reduce((s, n) => s + itemAmount(bal, n), 0),
    pretax,
    tax,
    netIncome,
    upToDate: input.upToDate,
  };
}
