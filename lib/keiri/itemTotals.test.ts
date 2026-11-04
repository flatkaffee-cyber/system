import { test } from "node:test";
import assert from "node:assert/strict";
import { buildItemTotals, UNKNOWN_ITEM, type ItemInput } from "./itemTotals.ts";
import type { FreeeDetail } from "./types.ts";

const SHIIRE = 1;
const SHOMO = 2;
const YACHIN = 3;
const SALES = 9;

const line = (account_item_id: number, amount: number, description: string, more: Partial<FreeeDetail> = {}): FreeeDetail => ({
  account_item_id,
  amount,
  description,
  entry_side: "debit",
  ...more,
});

const input = (over: Partial<ItemInput> = {}): ItemInput => ({
  deals: [],
  journals: [],
  expenseAccounts: new Map([[SHIIRE, "仕入高"], [SHOMO, "消耗品費"], [YACHIN, "地代家賃"]]),
  itemNames: new Map([[10, "牛乳"], [11, "卵"], [12, "消費税"]]),
  partnerNames: new Map([[100, "平和堂"]]),
  receiptVendors: new Map([[501, "ローソン"]]),
  resolve: () => null,
  ...over,
});

test("品目ごとに足して、多い順に並べる", () => {
  const v = buildItemTotals(input({
    deals: [
      { id: 1, issue_date: "2026-11-02", type: "expense", partner_id: 100, details: [line(SHIIRE, 1140, "牛乳 5コ", { item_id: 10 }), line(SHIIRE, 300, "卵", { item_id: 11 })] },
      { id: 2, issue_date: "2026-11-05", type: "expense", partner_id: 100, details: [line(SHIIRE, 500, "牛乳 2コ", { item_id: 10 })] },
    ],
  }));
  assert.deepEqual(v.rows.map((r) => [r.item, r.total, r.count]), [["牛乳", 1640, 2], ["卵", 300, 1]]);
  assert.equal(v.total, 1940);
  assert.equal(v.rows[0].buys[0].vendor, "平和堂");
});

test("消費税の行はほかの行に割り振って、合計は変えない", () => {
  const v = buildItemTotals(input({
    deals: [{
      id: 1, issue_date: "2026-11-02", type: "expense",
      details: [line(SHIIRE, 200, "牛乳", { item_id: 10 }), line(SHIIRE, 100, "卵", { item_id: 11 }), line(SHIIRE, 31, "消費税等", { item_id: 12 })],
    }],
  }));
  assert.deepEqual(v.rows.map((r) => [r.item, r.total]), [["牛乳", 221], ["卵", 110]]);
  assert.equal(v.total, 331);
});

test("消費税だけの取引は消費税のまま出す", () => {
  const v = buildItemTotals(input({
    deals: [{ id: 1, issue_date: "2026-11-02", type: "expense", details: [line(SHIIRE, 31, "消費税等", { item_id: 12 })] }],
  }));
  assert.deepEqual(v.rows.map((r) => [r.item, r.total]), [["消費税", 31]]);
});

test("詳細未登録は別の行に集めて、数と金額を返す", () => {
  const v = buildItemTotals(input({
    deals: [{ id: 1, issue_date: "2026-11-02", type: "expense", details: [line(SHOMO, 6250, "詳細未登録（レシートなし・カード明細から）")] }],
  }));
  assert.equal(v.rows[0].item, UNKNOWN_ITEM);
  assert.equal(v.unknownTotal, 6250);
  assert.equal(v.unknownCount, 1);
});

test("品目が決まらない行は、仕入高と消耗品費は品目なし、ほかは科目名で出す", () => {
  const v = buildItemTotals(input({
    deals: [{ id: 1, issue_date: "2026-11-02", type: "expense", details: [line(SHOMO, 500, "絨毯"), line(YACHIN, 104830, "店舗家賃")] }],
  }));
  assert.deepEqual(v.rows.map((r) => r.item), ["地代家賃", "消耗品費（品目なし）"]);
});

test("品目が空なら備考の商品名から決める", () => {
  const v = buildItemTotals(input({
    deals: [{ id: 1, issue_date: "2026-11-02", type: "expense", details: [line(SHIIRE, 700, "成分無調整牛乳")] }],
    resolve: (d) => (d.includes("牛乳") ? "牛乳" : null),
  }));
  assert.equal(v.rows[0].item, "牛乳");
});

test("商品名からの判定は仕入高と消耗品費だけ。家賃の備考は品目にしない", () => {
  const v = buildItemTotals(input({
    deals: [{ id: 1, issue_date: "2026-11-02", type: "expense", details: [line(YACHIN, 104830, "日本セーフティー経由の店舗家賃")] }],
    resolve: (d) => (d.includes("ティー") ? "紅茶" : null),
  }));
  assert.equal(v.rows[0].item, "地代家賃");
});

test("返金はマイナスで足し、売上の行は入れない", () => {
  const v = buildItemTotals(input({
    deals: [
      { id: 1, issue_date: "2026-11-02", type: "income", details: [line(SHOMO, 6250, "返金", { entry_side: "credit", item_id: 11 })] },
      { id: 2, issue_date: "2026-11-02", type: "expense", details: [line(SHOMO, 8000, "買い物", { item_id: 11 })] },
      { id: 3, issue_date: "2026-11-02", type: "income", details: [line(SALES, 9570, "売上", { entry_side: "credit" })] },
    ],
  }));
  assert.deepEqual(v.rows.map((r) => [r.item, r.total, r.count]), [["卵", 1750, 2]]);
});

test("振替伝票は貸方の相手ではなく領収書の店名を出す", () => {
  const v = buildItemTotals(input({
    journals: [{
      id: 501, issue_date: "2026-10-31",
      details: [line(SHOMO, 400, "プリント代", { item_id: 11 }), line(99, 400, "現金", { entry_side: "credit" })],
    }],
  }));
  assert.equal(v.rows[0].buys[0].vendor, "ローソン");
  assert.equal(v.rows[0].buys[0].sourceType, "journal");
});
