import { test } from "node:test";
import assert from "node:assert/strict";
import { advancesByPerson, nextPayday, repaymentPlan, UNASSIGNED } from "./advances.ts";

const ID = 1035440156;
// 2026-10-21 の freee の役員借入金（取引先の内訳）
const balances = [
  {
    account_item_id: ID,
    closing_balance: 0,
    partners: [
      { id: 0, name: "未選択", opening_balance: 60000, debit_amount: 0, credit_amount: 3359, closing_balance: 63359 },
      { id: 1, name: "國仲", opening_balance: 0, debit_amount: 0, credit_amount: 264964, closing_balance: 264964 },
      { id: 2, name: "坂本", opening_balance: 0, debit_amount: 800000, credit_amount: 798403, closing_balance: -1597 },
      { id: 3, name: "坂本達郎", opening_balance: 0, debit_amount: 100000, credit_amount: 0, closing_balance: -100000 },
      { id: 4, name: "櫻井", opening_balance: 0, debit_amount: 0, credit_amount: 395317, closing_balance: 395317 },
      { id: 5, name: "櫻井勘吉", opening_balance: 0, debit_amount: 30000, credit_amount: 0, closing_balance: -30000 },
      { id: 6, name: "町田", opening_balance: 0, debit_amount: 0, credit_amount: 5606, closing_balance: 5606 },
    ],
  },
];

test("人ごとにまとめ、未選択を坂本と國仲に分ける", () => {
  const by = Object.fromEntries(advancesByPerson(balances, ID).map((a) => [a.person, a]));
  assert.deepEqual(by["櫻井"], { person: "櫻井", advanced: 395317, repaid: 30000, balance: 365317 });
  assert.equal(by["國仲"].balance, 267883); // 264,964 + temu 2,919
  assert.equal(by["坂本"].balance, -41157);
  assert.equal(by["町田"].balance, 5606);
  assert.equal(by[UNASSIGNED], undefined);
});

test("未選択が持ち主の合計より多ければ（取引先なし）で残す", () => {
  const b = [{ account_item_id: ID, partners: [{ id: 0, name: "未選択", opening_balance: 60000, credit_amount: 13359, debit_amount: 0, closing_balance: 73359 }] }];
  const by = Object.fromEntries(advancesByPerson(b, ID).map((a) => [a.person, a.balance]));
  assert.equal(by["坂本"], 60440);
  assert.equal(by["國仲"], 2919);
  assert.equal(by[UNASSIGNED], 10000);
});

test("次の返済日は6日。当日以降なら来月", () => {
  assert.equal(nextPayday("2026-10-21", 6), "2026-11-06");
  assert.equal(nextPayday("2026-11-05", 6), "2026-11-06");
  assert.equal(nextPayday("2026-11-06", 6), "2026-12-06");
  assert.equal(nextPayday("2026-12-20", 6), "2027-01-06");
});

test("櫻井 365,317 を3万円ずつ → 13回目 2027-11-06 に 5,317", () => {
  const p = repaymentPlan(365317, { monthly: 30000, day: 6, today: "2026-10-21" });
  assert.equal(p.length, 13);
  assert.deepEqual(p[0], { date: "2026-11-06", amount: 30000, remaining: 335317 });
  assert.deepEqual(p[12], { date: "2027-11-06", amount: 5317, remaining: 0 });
});

test("残りが無ければ予定も無い", () => {
  assert.deepEqual(repaymentPlan(-41157, { monthly: 30000, day: 6, today: "2026-10-21" }), []);
});
