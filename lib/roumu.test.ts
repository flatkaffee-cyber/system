import { test } from "node:test";
import assert from "node:assert/strict";
import { MEMBERS, premium, monthlyPayment, payroll, dueDate, roundEmployee } from "./roumu.ts";

// 2026-10-30 に手で計算した数字（memory flat-shaho）と合うこと
test("1人の本人負担は 10,984円", () => {
  const p = premium(MEMBERS[0]);
  assert.deepEqual([p.health, p.support, p.pension, p.employee], [2865, 67, 8052, 10984]);
});

test("50銭ちょうどは切り捨て、超えたら切り上げ", () => {
  assert.equal(roundEmployee(100.5), 100);
  assert.equal(roundEmployee(100.51), 101);
});

test("3人分の毎月の納付は 66,853円（本人 32,952・会社 33,901）", () => {
  const m = monthlyPayment();
  assert.deepEqual([m.total, m.employee, m.employer], [66853, 32952, 33901]);
});

test("9月分は 10/31 が土曜なので 11/2 に払う", () => {
  assert.equal(dueDate("2026-09"), "2026-11-02");
  assert.equal(dueDate("2026-10"), "2026-11-30");
});

test("9月支給は保険料なし、10月支給は引き忘れ、11月支給は10月分を引いて 52,015円", () => {
  assert.equal(payroll("2026-09")[0].insMonth, null);
  assert.equal(payroll("2026-10")[0].net, 62999);
  const nov = payroll("2026-11")[0];
  assert.equal(nov.insMonth, "2026-10");
  assert.equal(nov.tax, 0);
  assert.equal(nov.net, 52015);
});
