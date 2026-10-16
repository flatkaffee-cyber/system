import { test } from "node:test";
import assert from "node:assert/strict";
import { SYNC_LOCK, tryLock, unlock } from "./lock.ts";
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
