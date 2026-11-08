// 「今月の成績」に足す、イベント出店の売上。
// 出店の売上は Square を使わず、freee に手で記帳している（科目は売上高、摘要に「イベント」）。
// Square 連携の取引は Square の集計にもう入っているので数えない。
// node --test でそのまま動かすため、実行時に他のファイルを import しない。
import type { FreeeDeal } from "./types";

export type EventSale = { date: string; label: string; amount: number };

/** 摘要の頭からイベント名を取る。「城祭り（11/3・…）売上…」→「城祭り」 */
export function eventLabel(description: string): string {
  const head = description.split(/[（(]/)[0].replace(/\s*(出店\s*)?売上.*$/, "").trim();
  return head || "イベント";
}

/** 手で入れた売上高のうち摘要に「イベント」がある行を、日付とイベント名ごとにまとめる（日付順） */
export function eventSalesFromDeals(
  deals: (FreeeDeal & { deal_origin_name?: string | null })[],
  salesAccountId: number,
): EventSale[] {
  const byKey = new Map<string, EventSale>();
  for (const d of deals) {
    if (d.type !== "income" || /Square/.test(d.deal_origin_name ?? "")) continue;
    for (const x of d.details) {
      const desc = x.description ?? "";
      if (x.account_item_id !== salesAccountId || !/イベント/.test(desc)) continue;
      const label = eventLabel(desc);
      const key = `${d.issue_date} ${label}`;
      const cur = byKey.get(key) ?? { date: d.issue_date, label, amount: 0 };
      cur.amount += x.entry_side === "debit" ? -x.amount : x.amount;
      byKey.set(key, cur);
    }
  }
  return [...byKey.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
