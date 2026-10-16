import { test } from "node:test";
import assert from "node:assert/strict";
import { stillMine, SYNC_LOCK, tryLock, unlock } from "./lock.ts";
import { fakeKv } from "./fakeKv.test-util.ts";

test("取れている間は、ほかは取れない。合言葉が違えば外れない", async () => {
  const kv = fakeKv();
  const a = await tryLock(kv, SYNC_LOCK, 120);
  assert.ok(a);
  assert.equal(await tryLock(kv, SYNC_LOCK, 120), null);
  await unlock(kv, SYNC_LOCK, "ちがう");
  assert.equal(await tryLock(kv, SYNC_LOCK, 120), null);
  await unlock(kv, SYNC_LOCK, a!);
  assert.ok(await tryLock(kv, SYNC_LOCK, 120));
});

test("鍵がまだ自分のものか（期限が切れてほかが取ったら false）", async () => {
  const kv = fakeKv();
  const a = await tryLock(kv, SYNC_LOCK, 330);
  assert.equal(await stillMine(kv, SYNC_LOCK, a!), true);
  kv.m.set(SYNC_LOCK, "ほかの取り込み");
  assert.equal(await stillMine(kv, SYNC_LOCK, a!), false);
});
