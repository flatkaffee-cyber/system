// カードで決済したあとに閉じた注文の控え。
//
// カード決済はSquare POSアプリ側で別の注文として計上されるため、
// こちらの注文は「支払い済みだが閉じる手段がCANCELEDしかない」状態になる。
// KDSはOPENとCOMPLETEDしか見ていないので、カードで払った途端に
// 厨房の画面から消えていた。ここに控えておき、KDS向けの取得では
// CANCELEDでもこの控えにあるものは出す。

const KEY = "kds:cardPaid";
const TTL_MS = 3 * 60 * 60 * 1000; // KDSの表示窓（90分）より長ければよい

type Entry = { id: string; at: number };

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

async function load(): Promise<Entry[]> {
  const store = await kv();
  if (!store) return [];
  const all = (await store.get<Entry[]>(KEY)) ?? [];
  const now = Date.now();
  return all.filter((e) => now - e.at < TTL_MS);
}

/** カード決済で閉じた注文として覚える。閉じる処理の側で呼ぶ */
export async function markCardPaid(orderId: string): Promise<void> {
  const store = await kv();
  if (!store) return;
  const cur = (await load()).filter((e) => e.id !== orderId);
  await store.set(KEY, [...cur, { id: orderId, at: Date.now() }]);
}

/** KDSに出してよいCANCELED注文のID */
export async function cardPaidIds(): Promise<Set<string>> {
  return new Set((await load()).map((e) => e.id));
}
