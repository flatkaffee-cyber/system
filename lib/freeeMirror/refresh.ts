// freee との接続の鍵（アクセストークン）の更新を1つずつにする。
// freee は更新のたびに refresh_token が新しくなるので、同時に2つ更新すると古い方が失敗する。
// 鍵を取れた1つだけが更新し、ほかは保存された新しい鍵を読み直して使う。
// 依存（KV・保存・freee への更新・時計）は引数でもらう。
import type { LockKv } from "./lock";

export type Tokens = { access_token: string; refresh_token: string; expires_at: number };

export type RefreshDeps = {
  kv: LockKv;
  load(): Promise<Tokens | null>;
  save(t: Tokens): Promise<void>;
  refresh(refreshToken: string): Promise<Tokens>;
  nowSec(): number;
  sleep(ms: number): Promise<void>;
  notConnected(): Error;
};

export const REFRESH_LOCK = "freee:refresh-lock";
const LOCK_SEC = 20;
const WAIT_MS = 500;
const WAIT_TIMES = 20;

export async function accessTokenWithLock(d: RefreshDeps): Promise<string> {
  // 期限60秒前までは使える（今までの lib/freee.ts と同じ判定）
  const usable = (t: Tokens) => t.expires_at - 60 > d.nowSec();
  const t = await d.load();
  if (!t) throw d.notConnected();
  if (usable(t)) return t.access_token;

  const token = globalThis.crypto.randomUUID();
  if ((await d.kv.set(REFRESH_LOCK, token, { nx: true, ex: LOCK_SEC })) === "OK") {
    try {
      const t2 = await d.load();
      if (!t2) throw d.notConnected();
      if (usable(t2)) return t2.access_token;
      const nt = await d.refresh(t2.refresh_token);
      await d.save(nt);
      return nt.access_token;
    } finally {
      if ((await d.kv.get(REFRESH_LOCK)) === token) await d.kv.del(REFRESH_LOCK);
    }
  }
  for (let i = 0; i < WAIT_TIMES; i++) {
    await d.sleep(WAIT_MS);
    const t3 = await d.load();
    if (t3 && usable(t3)) return t3.access_token;
  }
  throw new Error("freeeの接続の更新を待ちきれませんでした");
}
