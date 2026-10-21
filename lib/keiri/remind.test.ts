import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRemindMessage, type RemindInput } from "./remind.ts";

const empty: RemindInput = { today: "2026-10-21", base: "https://x", unprocessed: [], noReceipt: [], unregisteredAdvances: [] };

test("頼むことが無い日は送らない", () => {
  assert.equal(buildRemindMessage(empty), null);
});

test("レシートが無い支払いを並べる", () => {
  const m = buildRemindMessage({ ...empty, noReceipt: [{ date: "2026-10-18", amount: 10406, partner: "ドン・キホーテ 彦根店" }] })!;
  assert.match(m, /レシートが無い支払い 1件/);
  assert.match(m, /・10\/18 ドン・キホーテ 彦根店 ¥10,406/);
});

test("返済日の前は返済額と前倒しの判断を出す", () => {
  const repay = { date: "2026-11-06", items: [{ person: "櫻井", amount: 30000 }, { person: "國仲", amount: 30000 }], prepayThreshold: 300000 };
  const big = buildRemindMessage({ ...empty, repay: { ...repay, afterPayroll: 350000 } })!;
  assert.match(big, /11\/6 の立替の返済 ¥60,000/);
  assert.match(big, /前倒しで多めに返せます/);
  const small = buildRemindMessage({ ...empty, repay: { ...repay, afterPayroll: 120000 } })!;
  assert.match(small, /前倒しはせず/);
});
