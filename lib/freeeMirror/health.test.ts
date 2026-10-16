import { test } from "node:test";
import assert from "node:assert/strict";
import { alertMessage, isStale, needsReconnect, shouldAlert, stamp, type SyncState } from "./health.ts";

const T = Date.parse("2026-10-16T01:35:00Z"); // JST 10:35
const ok: SyncState = { lastSuccessAt: "2026-10-16T01:30:00Z", lastError: null, lastErrorAt: null, alertedAt: null };

test("最後の成功から15分を超えたら古い。一度も成功していなければ古い", () => {
  assert.equal(isStale(ok, T), false);
  assert.equal(isStale(ok, T + 11 * 60_000), true); // 16分
  assert.equal(isStale({ ...ok, lastSuccessAt: null }, T), true);
});

test("LINE は失敗中かつ最後の成功から60分以上で、まだ知らせていないときだけ", () => {
  const failing = { ...ok, lastError: "freee未接続です", lastErrorAt: "2026-10-16T02:35:00Z" };
  assert.equal(shouldAlert(failing, T + 30 * 60_000), false);
  assert.equal(shouldAlert(failing, T + 55 * 60_000), true); // 成功から60分
  assert.equal(shouldAlert({ ...failing, alertedAt: "2026-10-16T02:30:00Z" }, T + 90 * 60_000), false);
  assert.equal(shouldAlert({ ...failing, lastSuccessAt: null }, T), true);
});

test("エラーの記録が無くても（途中で打ち切られた）、60分成功していなければ知らせる。一度も動いていないだけなら知らせない", () => {
  assert.equal(shouldAlert(ok, T + 30 * 60_000), false);
  assert.equal(shouldAlert(ok, T + 120 * 60_000), true);
  assert.equal(shouldAlert({ ...ok, lastSuccessAt: null }, T), false);
});

test("再接続が要るエラーと、時刻の表示", () => {
  assert.equal(needsReconnect("freee未接続です"), true);
  assert.equal(needsReconnect("freeeトークン取得失敗(401): invalid_grant"), true);
  assert.equal(needsReconnect("freee API /api/1/deals 失敗(429): too many"), false);
  assert.equal(needsReconnect(null), false);
  assert.equal(stamp("2026-10-16T01:35:00Z"), "10/16 10:35");
});

test("LINE の文言: 最終の時刻とエラーの頭、リンクは合言葉の画面を通る /keiri", () => {
  const msg = alertMessage({ ...ok, lastError: "freee未接続です" + "x".repeat(200) }, "https://flat-keihi.vercel.app");
  assert.match(msg, /最終 10\/16 10:30/);
  assert.match(msg, /freee未接続です/);
  assert.ok(msg.includes("https://flat-keihi.vercel.app/keiri"));
  assert.ok(!msg.includes("/api/freee/authorize"));
  assert.ok(msg.split("\n")[1].length <= 80);
  assert.match(alertMessage({ ...ok, lastSuccessAt: null, lastError: "e" }, "https://x"), /最終 なし/);
});
