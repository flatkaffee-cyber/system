// 出店イベントのレジ。会計をイベントごとに記録する。
// KV: shutten:sales:<id>（会計のリスト。rpushで足すので同時に打っても消えない）
//     shutten:void:<id>（取り消した会計のid。ハッシュ）

const salesKey = (id: string) => `shutten:sales:${id}`;
const voidKey = (id: string) => `shutten:void:${id}`;

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type SaleLine = { name: string; price: number; qty: number };

export type Sale = {
  id: string;
  at: string; // ISO
  lines: SaleLine[];
  total: number;
  pay: "cash" | "card";
  received?: number; // 現金で預かった額
  voided?: boolean;
};

export async function getSales(id: string): Promise<Sale[]> {
  const store = await kv();
  if (!store) return [];
  const [list, voided] = await Promise.all([
    store.lrange<Sale>(salesKey(id), 0, -1),
    store.hgetall<Record<string, unknown>>(voidKey(id)),
  ]);
  const v = voided ?? {};
  return (list ?? []).map((s) => ({ ...s, voided: Boolean(v[s.id]) }));
}

export async function addSale(id: string, sale: Omit<Sale, "id" | "at" | "voided">): Promise<Sale> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const s: Sale = {
    ...sale,
    id: `r_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
  };
  await store.rpush(salesKey(id), s);
  return s;
}

export async function setVoid(id: string, saleId: string, voided: boolean): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  if (voided) await store.hset(voidKey(id), { [saleId]: 1 });
  else await store.hdel(voidKey(id), saleId);
}
