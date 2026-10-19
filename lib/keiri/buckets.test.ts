import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLines,
  classify,
  irregularRows,
  overrideKeysForRow,
  rowBucket,
  scopeTotals,
  sourceBucket,
  type AccountLike,
  type Bucket,
} from "./buckets.ts";

const PL = { account_category: "売上高" };
const accounts = new Map<number, AccountLike>([
  [1, { name: "売上高", ...PL }],
  [2, { name: "前受金", account_category: "流動負債" }],
  [3, { name: "消耗品費", account_category: "販売管理費" }],
  [4, { name: "普通預金", account_category: "現金・預金" }],
  [5, { name: "雑収入", account_category: "営業外収益" }],
]);
const none = { tagOf: () => [], overrides: {}, eventDays: new Set<string>() };

test("前受金の入金は＋、売上への振り替えは−。振り替えの売上の行は臨時なので全体に二重に入らない", () => {
  const sep = buildLines({ ...none, accounts, deals: [{ id: 10, issue_date: "2026-09-30", type: "income", details: [{ account_item_id: 2, amount: 508735, entry_side: "credit", description: "CAMPFIRE" }] }], journals: [] });
  assert.deepEqual(sep.offBook.map((o) => o.amount), [508735]);
  assert.equal(scopeTotals(sep.lines, sep.offBook).total, 508735);
  const nov = buildLines({ ...none, accounts, deals: [], journals: [{ id: 20, issue_date: "2026-11-30", details: [
    { account_item_id: 2, amount: 508735, entry_side: "debit" },
    { account_item_id: 1, amount: 508735, entry_side: "credit", description: "クラファン リターン発送" },
  ] }] });
  assert.deepEqual(nov.offBook.map((o) => o.amount), [-508735]);
  assert.equal(nov.lines[0].bucket, "irregular");
  assert.deepEqual(scopeTotals(nov.lines, nov.offBook), { store: 0, event: 0, irregular: 0, total: 0 });
});

test("損益でない科目（普通預金）は行にならない。雑収入は臨時", () => {
  const r = buildLines({ ...none, accounts, deals: [{ id: 30, issue_date: "2026-09-01", type: "income", details: [{ account_item_id: 5, amount: 10396, entry_side: "credit" }, { account_item_id: 4, amount: 10396, entry_side: "debit" }] }], journals: [] });
  assert.deepEqual(r.lines.map((l) => [l.account, l.bucket]), [["雑収入", "irregular"]]);
});

test("4つの数字。何も無い月は全部0", () => {
  const lines = [
    { bucket: "regular" as const, amount: 554263 }, { bucket: "regular" as const, amount: -727384 },
    { bucket: "event" as const, amount: 121976 }, { bucket: "irregular" as const, amount: -187256 },
  ];
  assert.deepEqual(scopeTotals(lines, [{ amount: 508735 }]), { store: -173121, event: 121976, irregular: 321479, total: 270334 });
  assert.deepEqual(scopeTotals([], []), { store: 0, event: 0, irregular: 0, total: 0 });
});

test("取引の区分は金額の大きい行。表の行の札: 取引の区分 → 損益の無い取引は臨時 → 結びつかない行は店舗。付け替えが勝つ", () => {
  assert.equal(sourceBucket([{ bucket: "regular", amount: -1000 }, { bucket: "event", amount: -30000 }]), "event");
  assert.equal(sourceBucket([]), null);
  const sources = new Map<string, Bucket>([["deal:1", "event"]]);
  assert.equal(rowBucket({ key: "w1", dealId: 1 }, sources, {}), "event"); // 前の月の取引でも sources にあれば
  assert.equal(rowBucket({ key: "w2", dealId: 2 }, sources, {}), "irregular"); // 工事・返済など
  assert.equal(rowBucket({ key: "w3" }, sources, {}), "regular"); // Square の入金など
  assert.equal(rowBucket({ key: "w3" }, sources, { "row:w3": "event" }), "event");
  assert.equal(rowBucket({ key: "w2", journalId: 9 }, sources, { "row:w2": "regular" }), "regular");
});

test("付け替えの鍵: 損益のある取引は月次レポートと同じ明細の鍵（全部の明細）、それ以外は行の鍵", () => {
  const sources = new Map<string, Bucket>([["deal:1", "regular"]]);
  const counts = new Map([["deal:1", 3]]);
  assert.deepEqual(overrideKeysForRow({ key: "w1", dealId: 1 }, sources, counts), ["deal:1:0", "deal:1:1", "deal:1:2"]);
  assert.deepEqual(overrideKeysForRow({ key: "w2", dealId: 2 }, sources, counts), ["row:w2"]);
  assert.deepEqual(overrideKeysForRow({ key: "w3" }, sources, counts), ["row:w3"]);
});

test("イベント日の支払報酬はイベント、摘要に返金は臨時、タグ「店舗備品」は臨時（今の決まりのまま）", () => {
  const ev = new Set(["2026-09-22"]);
  assert.equal(classify({ account: "支払報酬", description: "", tags: [], date: "2026-09-22", eventDays: ev, fromAdvance: false }).auto, "event");
  assert.equal(classify({ account: "消耗品費", description: "Amazon 返金", tags: [], date: "2026-09-02", eventDays: ev, fromAdvance: false }).auto, "irregular");
  assert.equal(classify({ account: "消耗品費", description: "", tags: ["店舗備品"], date: "2026-09-02", eventDays: ev, fromAdvance: false }).auto, "irregular");
  assert.equal(classify({ account: "売上高", description: "", tags: [], date: "2026-09-02", eventDays: ev, fromAdvance: true }).reason, "前受金からの振り替え");
});

test("臨時の一覧には前受金の動きも並び、合計が臨時の数字と一致する", () => {
  const r = buildLines({ ...none, accounts, deals: [
    { id: 30, issue_date: "2026-09-01", type: "income", details: [{ account_item_id: 5, amount: 10396, entry_side: "credit" }] },
    { id: 31, issue_date: "2026-09-30", type: "income", details: [{ account_item_id: 2, amount: 508735, entry_side: "credit", description: "CAMPFIRE" }] },
  ], journals: [] });
  const rows = irregularRows(r.lines, r.offBook);
  assert.deepEqual(rows.map((x) => [x.kind, x.amount]), [["line", 10396], ["advance", 508735]]);
  assert.equal(rows.reduce((s, x) => s + x.amount, 0), scopeTotals(r.lines, r.offBook).irregular);
});
