import { test } from "node:test";
import assert from "node:assert/strict";
import { isAmountOnly, pairPosOrders, type SqOrder } from "./posMatch.ts";

const sys = (id: string, at: string, amount: number, names: string[], state = "CANCELED"): SqOrder => ({
  id, state, created_at: at, ticket_name: "店内", total_money: { amount },
  line_items: names.map((n) => ({ name: n, quantity: "1", total_money: { amount: Math.round(amount / names.length) } })),
});
const pos = (id: string, at: string, amount: number): SqOrder => ({
  id, state: "COMPLETED", created_at: at, total_money: { amount }, tenders: [{}],
  line_items: [{ note: "店内", quantity: "1", total_money: { amount } }],
});

test("レジで金額だけ打った注文を見分ける", () => {
  assert.equal(isAmountOnly(pos("p", "2026-10-26T03:40:22Z", 1600)), true);
  assert.equal(isAmountOnly(sys("s", "2026-10-26T03:40:12Z", 1600, ["ガーデンメルト"], "COMPLETED")), false);
});

test("数秒前の同じ金額の注文とつなぐ", () => {
  const pairs = pairPosOrders(
    [sys("a", "2026-10-04T04:03:16Z", 5750, ["クラシックメルト", "ガーデンメルト"]), sys("b", "2026-10-04T05:20:32Z", 700, ["キリン一番搾り(中瓶)"])],
    [pos("x", "2026-10-04T04:03:25Z", 5750), pos("y", "2026-10-04T05:20:39Z", 700)],
  );
  assert.deepEqual(pairs.map((p) => [p.posId, p.sysId]), [["x", "a"], ["y", "b"]]);
  assert.deepEqual(pairs[0].items.map((i) => i.name), ["クラシックメルト", "ガーデンメルト"]);
});

test("金額が違う・時間が離れすぎ・後から作った注文とはつながない", () => {
  const pairs = pairPosOrders(
    [sys("a", "2026-10-04T04:03:16Z", 5000, ["x"]), sys("b", "2026-10-04T02:00:00Z", 700, ["y"]), sys("c", "2026-10-04T05:30:00Z", 900, ["z"])],
    [pos("x", "2026-10-04T04:03:25Z", 5750), pos("y", "2026-10-04T05:20:39Z", 700), pos("z", "2026-10-04T05:20:39Z", 900)],
  );
  assert.equal(pairs.length, 0);
});

test("同じ金額が続いても、1つの注文は1回しか使わない", () => {
  const pairs = pairPosOrders(
    [sys("a", "2026-10-04T05:15:00Z", 700, ["p1"]), sys("b", "2026-10-04T05:16:00Z", 700, ["p2"])],
    [pos("x", "2026-10-04T05:15:10Z", 700), pos("y", "2026-10-04T05:16:10Z", 700)],
  );
  assert.deepEqual(pairs.map((p) => [p.posId, p.sysId]), [["x", "a"], ["y", "b"]]);
});
