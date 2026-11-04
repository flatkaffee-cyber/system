import { test } from "node:test";
import assert from "node:assert/strict";
import { TASKS, monthDayDue } from "./opening.ts";

const deposit = TASKS.find((t) => t.id === "cash-deposit")!;

test("売上金の入金は5日と24日に出る", () => {
  assert.equal(monthDayDue(deposit, "2026-11-05"), true);
  assert.equal(monthDayDue(deposit, "2026-12-24"), true);
  assert.equal(monthDayDue(deposit, "2026-11-04"), false);
  assert.equal(monthDayDue(deposit, "2026-11-06"), false);
});

test("火曜に当たる月は前の月曜に出る", () => {
  assert.equal(monthDayDue(deposit, "2026-11-24"), false);
  assert.equal(monthDayDue(deposit, "2026-11-23"), true);
  assert.equal(monthDayDue(deposit, "2027-01-05"), false);
  assert.equal(monthDayDue(deposit, "2027-01-04"), true);
});

test("monthDays のない作業は出ない", () => {
  assert.equal(monthDayDue({ id: "x", phase: "朝", name: "x" }, "2026-11-05"), false);
});
