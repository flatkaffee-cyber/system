// KV を使った鍵。取り込みを同時に2つ動かさないために使う。KV は引数でもらう（テストでは偽物）。

export type LockKv = {
  set(key: string, value: string, opts: { nx: true; ex: number } | { ex: number }): Promise<unknown>;
  get(key: string): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
};

export const SYNC_LOCK = "freee:sync-lock";
/** システムから freee に書き込んだ印。毎分の cron が見て、5分を待たずに取り込む */
export const SYNC_DIRTY = "freee:sync-dirty";

/** 鍵を取る。取れたら合言葉、ほかが持っていれば null。ttlSec たつと自然に外れる */
export async function tryLock(kv: LockKv, key: string, ttlSec: number): Promise<string | null> {
  const token = globalThis.crypto.randomUUID();
  const r = await kv.set(key, token, { nx: true, ex: ttlSec });
  return r === "OK" ? token : null;
}

/** 自分の鍵のときだけ外す（期限切れのあとにほかが取った鍵は外さない） */
export async function unlock(kv: LockKv, key: string, token: string): Promise<void> {
  if ((await kv.get(key)) === token) await kv.del(key);
}

/** 鍵がまだ自分のものか。書く直前に確かめ、期限切れでほかが取っていたら書かずにやめる */
export async function stillMine(kv: LockKv, key: string, token: string): Promise<boolean> {
  return (await kv.get(key)) === token;
}
