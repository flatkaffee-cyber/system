import { test } from "node:test";
import assert from "node:assert/strict";
import { squareEventSales } from "./squareEvents.ts";

const json = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

test("取れたらイベントの分だけを返し ok", async () => {
  const r = await squareEventSales("https://x", {}, "2026-09-01", "2026-09-30", {
    fetchImpl: json({ excludedEvents: { sales: [{ label: "DJ", sales: 150000, reason: "イベント" }, { label: "休業", sales: 0, reason: "臨時休業" }] } }),
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.events, [{ label: "DJ", sales: 150000 }]);
});

test("失敗（例外・エラーの応答）は ok=false で、イベントは空", async () => {
  const boom = (async () => { throw new Error("network"); }) as unknown as typeof fetch;
  assert.equal((await squareEventSales("https://x", {}, "a", "b", { fetchImpl: boom })).ok, false);
  const bad = await squareEventSales("https://x", {}, "a", "b", { fetchImpl: json({}, false) });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.events, []);
});

test("遅すぎたら待たずに ok=false", async () => {
  const slow = ((_: unknown, init?: { signal?: AbortSignal }) =>
    new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
  const t0 = Date.now();
  const r = await squareEventSales("https://x", {}, "a", "b", { fetchImpl: slow, timeoutMs: 30 });
  assert.equal(r.ok, false);
  assert.ok(Date.now() - t0 < 2000);
});
