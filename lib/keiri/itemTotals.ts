// 品目ごとの支出。その月の取引と振替伝票の費用の行を、品目で束ねて合計する。
// 合計は損益計算書の費用と同じになる。経理の月次ページの「品目で見る」で使う。
// 純粋な関数。実行時に他のファイルを import しない（テストから .ts 付きで読むため）。
import type { FreeeDeal, FreeeDetail, FreeeJournal, ItemBuy, ItemTotal, ItemView } from "./types";

/** 中身が分からない行。品目の表の中で目立たせて、埋める対象にする */
export const UNKNOWN_ITEM = "中身が未登録";

/** 品目で見たい科目。品目が決まらない行は「（品目なし）」に集める。ほかの科目は科目名のまま出す */
const ITEMIZED_ACCOUNTS = new Set(["仕入高", "消耗品費"]);
const TAX_LINE = /^消費税/;

export type ItemInput = {
  deals: FreeeDeal[];
  journals: FreeeJournal[];
  /** 費用の科目だけ。id → 科目名 */
  expenseAccounts: Map<number, string>;
  itemNames: Map<number, string>;
  partnerNames: Map<number, string>;
  /** 取引・伝票の id → 領収書の店名 */
  receiptVendors: Map<number, string>;
  /** 備考の商品名から品目を決める（品目台帳と同じ判定） */
  resolve: (description: string) => string | null;
};

type Line = { detail: FreeeDetail; account: string; amount: number };

/** レシートの「消費税」の行は品目ではないので、同じ取引のほかの行に金額の比で割り振る */
function spreadTax(lines: Line[], itemNames: Map<number, string>): Line[] {
  const isTax = (l: Line) =>
    TAX_LINE.test(l.detail.description ?? "") || TAX_LINE.test(itemNames.get(l.detail.item_id ?? 0) ?? "");
  const goods = lines.filter((l) => !isTax(l));
  const base = goods.reduce((n, l) => n + l.amount, 0);
  if (!goods.length || base === 0) return lines;
  const tax = lines.filter(isTax).reduce((n, l) => n + l.amount, 0);
  const out = goods.map((l) => ({ ...l, amount: l.amount + Math.floor((tax * l.amount) / base) }));
  const rest = tax - out.reduce((n, l, i) => n + l.amount - goods[i].amount, 0);
  const largest = out.reduce((a, b) => (Math.abs(b.amount) > Math.abs(a.amount) ? b : a));
  largest.amount += rest;
  return out;
}

function itemOf(l: Line, input: ItemInput): string {
  const description = l.detail.description ?? "";
  if (description.includes("詳細未登録")) return UNKNOWN_ITEM;
  const named = input.itemNames.get(l.detail.item_id ?? 0) ?? input.resolve(description);
  if (named) return named;
  return ITEMIZED_ACCOUNTS.has(l.account) ? `${l.account}（品目なし）` : l.account;
}

export function buildItemTotals(input: ItemInput): ItemView {
  const rows = new Map<string, ItemTotal>();
  const add = (
    source: { id: number; issue_date: string; details: FreeeDetail[]; partner_id?: number | null },
    sourceType: ItemBuy["sourceType"],
  ) => {
    const lines: Line[] = [];
    for (const detail of source.details) {
      const account = input.expenseAccounts.get(detail.account_item_id);
      if (account) lines.push({ detail, account, amount: detail.entry_side === "debit" ? detail.amount : -detail.amount });
    }
    if (!lines.length) return;
    const partnerId = source.partner_id ?? lines.find((l) => l.detail.partner_id)?.detail.partner_id ?? 0;
    const vendor = input.partnerNames.get(partnerId) ?? input.receiptVendors.get(source.id) ?? "";
    for (const l of spreadTax(lines, input.itemNames)) {
      const item = itemOf(l, input);
      const row = rows.get(item) ?? { item, total: 0, count: 0, buys: [] };
      row.total += l.amount;
      row.count += 1;
      row.buys.push({
        date: source.issue_date,
        vendor,
        name: l.detail.description ?? "",
        account: l.account,
        amount: l.amount,
        sourceType,
        sourceId: source.id,
      });
      rows.set(item, row);
    }
  };
  for (const d of input.deals) add(d, "deal");
  for (const j of input.journals) add(j, "journal");

  const list = [...rows.values()].sort((a, b) => b.total - a.total);
  for (const r of list) r.buys.sort((a, b) => a.date.localeCompare(b.date));
  const unknown = rows.get(UNKNOWN_ITEM);
  return {
    rows: list,
    total: list.reduce((n, r) => n + r.total, 0),
    unknownTotal: unknown?.total ?? 0,
    unknownCount: unknown?.count ?? 0,
  };
}
