import { test } from "node:test";
import assert from "node:assert/strict";
import { accessTokenWithLock, REFRESH_LOCK, type RefreshDeps, type Tokens } from "./refresh.ts";

import { fakeKv } from "./fakeKv.test-util.ts";

const NOW = 1_800_000_000;
const tick = () => new Promise<void>((r) => setImmediate(r));
function deps(initial: Tokens | null) {
  const kv = fakeKv();
  let stored = initial;
  let calls = 0;
  const d: RefreshDeps = {
    kv,
    load: async () => stored,
    save: async (t) => { stored = t; },
    refresh: async (rt) => { calls++; await tick(); return { access_token: `new-${rt}`, refresh_token: "r2", expires_at: NOW + 21600 }; },
    nowSec: () => NOW,
    sleep: tick,
    notConnected: () => new Error("freee未接続です"),
  };
  return { d, calls: () => calls, kv };
}

test("期限に余裕があれば、更新しない", async () => {
  const { d, calls } = deps({ access_token: "a1", refresh_token: "r1", expires_at: NOW + 3600 });
  assert.equal(await accessTokenWithLock(d), "a1");
  assert.equal(calls(), 0);
});

test("期限が近いときに6本同時に呼んでも、更新は1回で、全員が新しい鍵を使う", async () => {
  const { d, calls, kv } = deps({ access_token: "a1", refresh_token: "r1", expires_at: NOW + 30 });
  const got = await Promise.all(Array.from({ length: 6 }, () => accessTokenWithLock(d)));
  assert.equal(calls(), 1);
  assert.deepEqual(new Set(got), new Set(["new-r1"]));
  assert.equal(kv.m.has(REFRESH_LOCK), false); // 鍵は外れている
});

test("ほかが更新中のまま終わらなければ、待ちきれずにエラー", async () => {
  const { d, kv } = deps({ access_token: "a1", refresh_token: "r1", expires_at: NOW + 30 });
  kv.m.set(REFRESH_LOCK, "ほかの人");
  await assert.rejects(accessTokenWithLock(d), /待ちきれませんでした/);
});

test("更新に失敗しても鍵は外す", async () => {
  const { d, kv } = deps({ access_token: "a1", refresh_token: "r1", expires_at: NOW + 30 });
  d.refresh = async () => { throw new Error("freeeトークン取得失敗(401)"); };
  await assert.rejects(accessTokenWithLock(d), /401/);
  assert.equal(kv.m.has(REFRESH_LOCK), false);
});

test("未接続", async () => {
  const { d } = deps(null);
  await assert.rejects(accessTokenWithLock(d), /未接続/);
});
