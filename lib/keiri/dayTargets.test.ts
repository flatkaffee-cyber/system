import { test } from "node:test";
import assert from "node:assert/strict";
import { sumTargets, type DayTarget } from "./dayTargets.ts";

const T: Record<string, DayTarget> = {
  "2026-11-09": { store: 14500 },
  "2026-11-10": { store: 0, closed: true },
  "2026-11-11": { store: 30000, label: "ムービーナイト" },
  "2026-11-21": { store: 30000, event: 75000, label: "えびす講" },
};

test("1日の目標は店と出店を足し、中身の名前も返す", () => {
  assert.deepEqual(sumTargets(T, "2026-11-21", "2026-11-21"), {
    total: 105000, store: 30000, event: 75000, labels: ["えびす講"], days: 1, closedDays: 0,
  });
});

test("期間は目標のある日を全部足す。定休日は日数に入れず別に数える", () => {
  assert.deepEqual(sumTargets(T, "2026-11-09", "2026-11-11"), {
    total: 44500, store: 44500, event: 0, labels: ["ムービーナイト"], days: 2, closedDays: 1,
  });
});

test("目標が1つも無い期間は null", () => {
  assert.equal(sumTargets(T, "2026-12-01", "2026-12-31"), null);
  assert.equal(sumTargets({}, "2026-11-09", "2026-11-09"), null);
});
