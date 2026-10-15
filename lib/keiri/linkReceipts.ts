// 出金の行に、システムの領収書・Amazonの注文番号・「レシートなし経費」の記録を紐づける。
// 領収書は freee 登録時に registered.journalId（取引IDまたは振替伝票ID）を持つので、それで引く。
import type { CashRow, ReceiptStatus } from "./types";

export type ReceiptRef = { id: string; vendor: string; registered?: { journalId: number } };
export type PendingRef = { date: string; amount: number; status: string; tags?: string[] };

const AMAZON_ORDER = /Amazon 注文(\d{3}-\d{7}-\d{7})/;
const NO_RECEIPT_TAG = "詳細未登録";

export function attachReceipts(rows: CashRow[], receipts: ReceiptRef[], pending: PendingRef[]): CashRow[] {
  const byJournal = new Map<number, ReceiptRef>();
  for (const r of receipts) if (r.registered?.journalId) byJournal.set(r.registered.journalId, r);
  const recorded = new Set(
    pending
      .filter((p) => p.status !== "skipped" && (p.tags ?? []).includes(NO_RECEIPT_TAG))
      .map((p) => `${p.date}|${p.amount}`),
  );

  return rows.map((row) => {
    if (row.kind === "move") return { ...row, receiptStatus: "n/a" as ReceiptStatus };
    if (row.kind !== "expense") return row;

    const id = row.dealId ?? row.journalId;
    const hit = id ? byJournal.get(id) : undefined;
    if (hit) return { ...row, receiptStatus: "attached", receipt: { id: hit.id, vendor: hit.vendor } };

    const order = AMAZON_ORDER.exec(row.description);
    if (order) return { ...row, receiptStatus: "amazon", amazonOrderId: order[1] };

    if (row.tag === "bank") return { ...row, receiptStatus: "n/a" };
    const status: ReceiptStatus = recorded.has(`${row.date}|${row.amount}`) ? "missing-recorded" : "missing";
    return { ...row, receiptStatus: status };
  });
}
