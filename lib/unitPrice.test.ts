import { test } from "node:test";
import assert from "node:assert/strict";
import { unitPriceOf } from "./unitPrice.ts";

test("単価が書いてある行は単価を使う", () => {
  assert.deepEqual(unitPriceOf("クリームチーズ 227g 4コ×単368", 1590), { price: 368, qty: 4 });
  assert.deepEqual(unitPriceOf("ショルダーハム切り落とし (2個×単858)", 1853), { price: 858, qty: 2 });
  assert.deepEqual(unitPriceOf("ステンボウル15 @698×2", 1396), { price: 698, qty: 2 });
  assert.deepEqual(unitPriceOf("ファーマインドレギュラーバナナ 5点 @128", 691), { price: 128, qty: 5 });
});

test("個数だけ書いてある行は割る", () => {
  assert.deepEqual(unitPriceOf("ベルギーワッフルミックス 3コ", 2622), { price: 874, qty: 3 });
  assert.deepEqual(unitPriceOf("有塩バター 3コ", 3330), { price: 1110, qty: 3 });
});

test("商品名の中の「×30本」「1L×6本」は箱の中身で、買った個数ではない", () => {
  assert.deepEqual(unitPriceOf("コカ・コーラ カナダドライ ジンジャーエール 160ml缶×30本", 2982), { price: 2982, qty: 1 });
  assert.deepEqual(unitPriceOf("ゴールドパック オレンジジュース 1L×6本", 592), { price: 592, qty: 1 });
  assert.deepEqual(unitPriceOf("サントリー ガムシロップ 780ml瓶×12", 847), { price: 847, qty: 1 });
});

test("注文で個数が分かっているときはそれで割る", () => {
  assert.deepEqual(unitPriceOf("ベルギーワッフルミックス 1kg", 2622, 3), { price: 874, qty: 3 });
});

test("何も書いていなければ金額がそのまま1個の値段", () => {
  assert.deepEqual(unitPriceOf("雪印ネオソフト300", 300), { price: 300, qty: 1 });
  // 容量の数字（227g・1000ml）を個数と取り違えない
  assert.deepEqual(unitPriceOf("クリームチーズ 227g", 368), { price: 368, qty: 1 });
  assert.deepEqual(unitPriceOf("純粋はちみつ 1KG", 462), { price: 462, qty: 1 });
});
