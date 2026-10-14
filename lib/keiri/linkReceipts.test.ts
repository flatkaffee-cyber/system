import { test } from "node:test";
import assert from "node:assert/strict";
import { attachReceipts } from "./linkReceipts.ts";
import type { CashRow } from "./types.ts";

const row = (over: Partial<CashRow>): CashRow => ({
  key: "k", date: "2026-10-11", amount: 1000, title: "t", detail: "消耗品費", kind: "expense", tag: "card", processed: true, ...over,
});

test("取引IDで領収書を紐づける", () => {
  const [r] = attachReceipts([row({ dealId: 3841164150 })], [{ id: "r_1", vendor: "ドン・キホーテ", registered: { journalId: 3841164150 } }], []);
  assert.equal(r.receiptStatus, "attached");
  assert.deepEqual(r.receipt, { id: "r_1", vendor: "ドン・キホーテ" });
});

test("振替伝票IDでも紐づける（現金払い）", () => {
  const [r] = attachReceipts([row({ tag: "cash", journalId: 3841192254 })], [{ id: "r_2", vendor: "CAINZ", registered: { journalId: 3841192254 } }], []);
  assert.equal(r.receiptStatus, "attached");
});

test("Amazonは注文番号で確認する", () => {
  const [r] = attachReceipts([row({ dealId: 9, detail: "消耗品費／手すり（Amazon 注文250-1506470-9347845）" })], [], []);
  assert.equal(r.receiptStatus, "amazon");
  assert.equal(r.amazonOrderId, "250-1506470-9347845");
});

test("レシートなし経費に記録があれば『記録済み』", () => {
  const rows = attachReceipts(
    [row({ dealId: 1, date: "2026-10-05", amount: 28140 }), row({ dealId: 2, date: "2026-10-07", amount: 276 })],
    [],
    [
      { date: "2026-10-05", amount: 28140, status: "pending", tags: ["詳細未登録"] },
      { date: "2026-10-07", amount: 276, status: "skipped", tags: ["詳細未登録"] },
    ],
  );
  assert.deepEqual(rows.map((r) => r.receiptStatus), ["missing-recorded", "missing"]);
});

test("銀行振込は領収書を求めない。ATMの移動も対象外", () => {
  const rows = attachReceipts([row({ tag: "bank", dealId: 5 }), row({ tag: "bank", kind: "move" })], [], []);
  assert.deepEqual(rows.map((r) => r.receiptStatus), ["n/a", "n/a"]);
});

test("入金の行には何も付けない", () => {
  const rows = attachReceipts([row({ kind: "sales", tag: undefined })], [], []);
  assert.equal(rows[0].receiptStatus, undefined);
});
