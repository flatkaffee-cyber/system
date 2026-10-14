import { test } from "node:test";
import assert from "node:assert/strict";
import { isMonth, jstMonth, periodOf, shiftMonth } from "./period.ts";

test("10月は期首2026年度、月末31日", () => {
  assert.deepEqual(periodOf("2026-10"), {
    month: "2026-10",
    from: "2026-10-01",
    to: "2026-10-31",
    fiscalYear: 2026,
    calendarMonth: 10,
  });
});

test("1月と5月は前の年に始まった年度", () => {
  assert.equal(periodOf("2027-01").fiscalYear, 2026);
  assert.equal(periodOf("2026-05").fiscalYear, 2025);
  assert.equal(periodOf("2026-06").fiscalYear, 2026);
});

test("うるう年の2月", () => {
  assert.equal(periodOf("2028-02").to, "2028-02-29");
});

test("年をまたぐ前後の月", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-10", -3), "2026-07");
});

test("形式が違う月は弾く", () => {
  assert.equal(isMonth("2026-13"), false);
  assert.equal(isMonth("2026-1"), false);
  assert.equal(isMonth("2026-10"), true);
  assert.throws(() => periodOf("abc"));
});

test("今月は日本時間で決める", () => {
  // UTC 9/30 16:00 = JST 10/1 01:00
  assert.equal(jstMonth(Date.UTC(2026, 8, 30, 16, 0)), "2026-10");
});
