import { test } from "node:test";
import assert from "node:assert/strict";
import { isStale, needsReconnect, shouldAlert, stamp, type SyncState } from "./health.ts";

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
  assert.equal(shouldAlert(ok, T + 120 * 60_000), false); // 失敗していない
  assert.equal(shouldAlert({ ...failing, lastSuccessAt: null }, T), true);
});

test("再接続が要るエラーと、時刻の表示", () => {
  assert.equal(needsReconnect("freee未接続です"), true);
  assert.equal(needsReconnect("freeeトークン取得失敗(401): invalid_grant"), true);
  assert.equal(needsReconnect("freee API /api/1/deals 失敗(429): too many"), false);
  assert.equal(needsReconnect(null), false);
  assert.equal(stamp("2026-10-16T01:35:00Z"), "10/16 10:35");
});
