// 貸借の試算表（取引先の内訳つき）から、ある勘定科目の残高と、取引先ごとのプラスの残高を出す。
// 払うもの（役員借入金の未返済）に使う。取引先 id 0 は freee の「未選択」なので取引先として扱わない。
import type { TrialBsBalance } from "../freeeMirror/source";

export function payablesFromTrialBs(
  balances: TrialBsBalance[],
  accountItemId: number,
): { total: number; byPartner: { id: number; name: string; amount: number }[] } {
  const row = balances.find((b) => b.account_item_id === accountItemId);
  return {
    total: row?.closing_balance ?? 0,
    byPartner: (row?.partners ?? [])
      .filter((p) => p.id !== 0 && p.closing_balance > 0)
      .map((p) => ({ id: p.id, name: p.name, amount: p.closing_balance })),
  };
}
