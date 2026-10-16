import { test } from "node:test";
import assert from "node:assert/strict";
import { chunk, mapLimit, monthHashes, needsNightly, shouldRunCron, trialPlMonthsToRefresh } from "./plan.ts";

test("月ごとのハッシュは、その月の行が変わったときだけ変わる", () => {
  const base = { deals: [{ id: 1, issue_date: "2026-09-03" }, { id: 2, issue_date: "2026-10-01" }], journals: [], transfers: [] };
  const a = monthHashes(base);
  assert.deepEqual(Object.keys(a).sort(), ["2026-09", "2026-10"]);
  const b = monthHashes({ ...base, deals: [base.deals[1], base.deals[0]] }); // 並びが違っても同じ
  assert.deepEqual(a, b);
  const c = monthHashes({ ...base, journals: [{ id: 9, issue_date: "2026-09-30" }] });
  assert.notEqual(c["2026-09"], a["2026-09"]);
  assert.equal(c["2026-10"], a["2026-10"]);
});

test("同じ id の取引でも、中身が変わればその月のハッシュが変わる", () => {
  const before = monthHashes({ deals: [{ id: 1, issue_date: "2026-09-03", amount: 100 } as { id: number; issue_date: string }], journals: [], transfers: [] });
  const after = monthHashes({ deals: [{ id: 1, issue_date: "2026-09-03", amount: 120 } as { id: number; issue_date: string }], journals: [], transfers: [] });
  assert.notEqual(after["2026-09"], before["2026-09"]);
});

test("試算表を取り直す月: 今月・先月・変わった月・未保存・集計中。毎晩は全部", () => {
  const fyMonths = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
  const common = { fyMonths, thisMonth: "2026-10", storedMonths: fyMonths, notUpToDate: [] as string[], nightly: false };
  assert.deepEqual(trialPlMonthsToRefresh({ ...common, prevHashes: { "2026-08": "x" }, nextHashes: { "2026-08": "x" } }), ["2026-09", "2026-10"]);
  assert.deepEqual(trialPlMonthsToRefresh({ ...common, prevHashes: { "2026-07": "x" }, nextHashes: { "2026-07": "y" } }), ["2026-07", "2026-09", "2026-10"]);
  assert.deepEqual(trialPlMonthsToRefresh({ ...common, storedMonths: ["2026-09", "2026-10"], prevHashes: {}, nextHashes: {} }), fyMonths);
  assert.deepEqual(trialPlMonthsToRefresh({ ...common, notUpToDate: ["2026-06"], prevHashes: {}, nextHashes: {} }), ["2026-06", "2026-09", "2026-10"]);
  assert.deepEqual(trialPlMonthsToRefresh({ ...common, nightly: true, prevHashes: {}, nextHashes: {} }), fyMonths);
  // 期首の月は先月が期外なので今月だけ
  assert.deepEqual(trialPlMonthsToRefresh({ ...common, fyMonths: ["2026-06"], thisMonth: "2026-06", storedMonths: ["2026-06"], prevHashes: {}, nextHashes: {} }), ["2026-06"]);
});

test("毎晩の取り込みは3時以降に1日1回", () => {
  assert.equal(needsNightly(null, "2026-10-16", 14), true);
  assert.equal(needsNightly("2026-10-15", "2026-10-16", 2), false);
  assert.equal(needsNightly("2026-10-15", "2026-10-16", 3), true);
  assert.equal(needsNightly("2026-10-16", "2026-10-16", 9), false);
});

test("分割", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 500), []);
});

test("毎分の cron が取り込むのは、書き込みの印があるか、前回（成功でも失敗でも）から5分たったとき", () => {
  const now = Date.parse("2026-10-16T01:35:00Z");
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  assert.equal(shouldRunCron({ dirty: true, lastSuccessAt: ago(1), lastErrorAt: null, nowMs: now }), true);
  assert.equal(shouldRunCron({ dirty: false, lastSuccessAt: null, lastErrorAt: null, nowMs: now }), true);
  assert.equal(shouldRunCron({ dirty: false, lastSuccessAt: ago(3), lastErrorAt: null, nowMs: now }), false);
  assert.equal(shouldRunCron({ dirty: false, lastSuccessAt: ago(5), lastErrorAt: null, nowMs: now }), true);
  // 失敗が続いているときも、やり直しは5分おき（毎分 freee を叩かない）
  assert.equal(shouldRunCron({ dirty: false, lastSuccessAt: ago(60), lastErrorAt: ago(2), nowMs: now }), false);
  assert.equal(shouldRunCron({ dirty: false, lastSuccessAt: ago(60), lastErrorAt: ago(6), nowMs: now }), true);
});

test("同時に3本までで回し、結果は渡した順に返す", async () => {
  let running = 0;
  let peak = 0;
  const got = await mapLimit([5, 1, 4, 2, 3, 0], 3, async (n) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, n));
    running--;
    return n * 10;
  });
  assert.deepEqual(got, [50, 10, 40, 20, 30, 0]);
  assert.equal(peak, 3);
});
