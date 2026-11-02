import { test } from "node:test";
import assert from "node:assert/strict";
import { dueSlots, jstNow, nextRun, postedManually, runKey, runsOn, type StoryRule } from "./instagramPlan.ts";

const TUE = 2; // 定休日

const opening: StoryRule = {
  id: "open",
  name: "オープン",
  enabled: true,
  frequency: "daily",
  weekdays: [],
  monthDays: [],
  dates: [],
  slots: [
    { time: "10:00", imageIds: ["a"] },
    { time: "19:00", imageIds: ["b"] },
  ],
  businessDaysOnly: true,
  skipIfPosted: true,
  skipWindowMin: 60,
  updatedAt: "",
};

const running: StoryRule = {
  ...opening,
  id: "run",
  name: "ランニング",
  frequency: "weekly",
  weekdays: [6], // 土曜
  businessDaysOnly: false,
  slots: [{ time: "10:00", imageIds: ["r"] }],
};

test("jstNow はUTCを日本時間に直す", () => {
  // 2026-11-03 01:00 UTC = 10:00 JST（火曜）
  const n = jstNow(Date.parse("2026-11-03T01:00:00Z"));
  assert.deepEqual(n, { date: "2026-11-03", minutes: 600, weekday: 2 });
});

test("営業日だけの決まりは、火曜と臨時休業の日は出さない", () => {
  assert.equal(runsOn(opening, "2026-11-03", TUE, []), false); // 火
  assert.equal(runsOn(opening, "2026-11-04", TUE, []), true); // 水
  assert.equal(runsOn(opening, "2026-11-04", TUE, ["2026-11-04"]), false);
});

test("毎週・毎月・カスタム", () => {
  assert.equal(runsOn(running, "2026-11-07", TUE, []), true); // 土
  assert.equal(runsOn(running, "2026-11-08", TUE, []), false);
  const monthly = { ...opening, frequency: "monthly" as const, monthDays: [1, 15], businessDaysOnly: false };
  assert.equal(runsOn(monthly, "2026-12-01", TUE, []), true);
  assert.equal(runsOn(monthly, "2026-12-02", TUE, []), false);
  const custom = { ...opening, frequency: "custom" as const, dates: ["2026-12-24"], businessDaysOnly: false };
  assert.equal(runsOn(custom, "2026-12-24", TUE, []), true);
  assert.equal(runsOn(custom, "2026-12-25", TUE, []), false);
});

test("時刻を過ぎて30分以内・未実行のものだけ出す", () => {
  const sat = "2026-11-07";
  const at = (m: number) => ({ date: sat, minutes: m });
  assert.equal(dueSlots([opening, running], at(599), TUE, [], new Set()).length, 0);
  assert.equal(dueSlots([opening, running], at(600), TUE, [], new Set()).length, 2);
  assert.equal(dueSlots([opening, running], at(631), TUE, [], new Set()).length, 0);
  const done = new Set([runKey("open", sat, "10:00")]);
  const due = dueSlots([opening, running], at(605), TUE, [], done);
  assert.deepEqual(due.map((d) => d.rule.id), ["run"]);
});

test("時刻の前1時間に手で上げていたら、出したことにする", () => {
  const date = "2026-11-04";
  const s = (iso: string, id = "x") => [{ id, timestamp: iso }];
  // 9:30 JST に手で上げた
  assert.equal(postedManually(s("2026-11-04T00:30:00+0000"), new Set(), date, "10:00", 60), true);
  // 8:30 は幅の外
  assert.equal(postedManually(s("2026-11-03T23:30:00+0000"), new Set(), date, "10:00", 60), false);
  // 10:03 に手で上げたのも数える（cronが少し遅れて動くため）
  assert.equal(postedManually(s("2026-11-04T01:03:00+0000"), new Set(), date, "10:00", 60), true);
  // 自動で上げたものは数えない
  assert.equal(postedManually(s("2026-11-04T00:59:00+0000", "own"), new Set(["own"]), date, "10:00", 60), false);
  // 朝の分は夜の判定に入らない
  assert.equal(postedManually(s("2026-11-04T01:00:00+0000"), new Set(), date, "19:00", 60), false);
});

test("次はいつ", () => {
  // 月曜 20:00 → 次は水曜の朝（火曜は定休日）
  assert.deepEqual(nextRun(opening, { date: "2026-11-02", minutes: 1200 }, TUE, []), {
    date: "2026-11-04",
    time: "10:00",
  });
  assert.deepEqual(nextRun(opening, { date: "2026-11-04", minutes: 700 }, TUE, []), {
    date: "2026-11-04",
    time: "19:00",
  });
});
