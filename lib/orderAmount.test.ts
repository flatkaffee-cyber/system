import test from "node:test";
import assert from "node:assert/strict";
import { orderLineAmount } from "./orderAmount.ts";

test("モノタロウは行の金額に個数を掛けず、税込の合計に合わせる", () => {
  const o = { source: "モノタロウ", total: 5271, items: [{ price: 4792, quantity: 4 }] };
  assert.equal(orderLineAmount(o, o.items[0]), 5271);
});
test("配送費つきのモノタロウは合計が注文の金額になる", () => {
  const o = { source: "モノタロウ", total: 2966, items: [{ price: 2196, quantity: 2 }, { price: 500, quantity: 1 }] };
  assert.equal(o.items.reduce((n, i) => n + orderLineAmount(o, i), 0), 2966);
});
test("Amazon は単価×個数", () => {
  assert.equal(orderLineAmount({ source: "Amazon", total: 4002 }, { price: 2001, quantity: 2 }), 4002);
});
