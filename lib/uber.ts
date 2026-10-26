// Uber Eats の注文（Squareには入らない）。
// Uber Eats Manager の画面から週1回取り込み、店内の売上と合わせて仕込み量や売れ筋を見るのに使う。
// 取り込むのは注文日時・金額・商品だけ。注文者・配達員の名前や住所は持たない。

const KEY = "uber:orders";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type UberOption = { group: string; name: string; qty: number; options?: UberOption[] };
export type UberItem = { name: string; qty: number; price: number; options: UberOption[] };
export type UberOrder = {
  uuid: string;
  orderId: string;
  /** 注文した日時（JST、YYYY-MM-DDTHH:mm） */
  requestedAt: string;
  /** 営業日（朝6時切替） */
  date: string;
  status: string;
  fulfillment: string;
  /** 商品の合計（税込・円） */
  subtotal: number;
  /** 店の受取額（円） */
  net: number;
  items: UberItem[];
};

export async function getUberOrders(): Promise<Record<string, UberOrder>> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<Record<string, UberOrder>>(KEY)) ?? {};
}

/** 同じ注文は上書き。何件増えたかを返す */
export async function saveUberOrders(orders: UberOrder[]): Promise<{ added: number; total: number }> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = (await store.get<Record<string, UberOrder>>(KEY)) ?? {};
  let added = 0;
  for (const o of orders) {
    if (!all[o.uuid]) added++;
    all[o.uuid] = o;
  }
  await store.set(KEY, all);
  return { added, total: Object.keys(all).length };
}

const yen = (s: unknown) => Number(String(s ?? "").replace(/[^0-9.]/g, "")) || 0;

/**
 * Uber Eats Manager の OrderDetails の返り値を、ここで持つ形にする。
 * 取り込み側（ブラウザで動かすスクリプト）はこの関数と同じ形で送ってもよいし、生のまま送ってもよい
 */
export function fromOrderDetails(
  od: {
    requestedAt: number;
    orderId: string;
    orderUUID?: string;
    fulfillmentType?: string;
    netPayout?: string;
    checkoutInfo?: { key: string; amount: string }[];
    items?: {
      name: string;
      price?: string;
      quantity?: number;
      customizations?: RawCust[];
    }[];
  },
  uuid: string,
  status: string,
): UberOrder {
  const jst = new Date(od.requestedAt * 1000 + 9 * 3600_000);
  const biz = new Date(od.requestedAt * 1000 + 3 * 3600_000);
  return {
    uuid,
    orderId: od.orderId,
    requestedAt: jst.toISOString().slice(0, 16),
    date: biz.toISOString().slice(0, 10),
    status,
    fulfillment: od.fulfillmentType ?? "",
    subtotal: yen(od.checkoutInfo?.find((c) => c.key === "Subtotal")?.amount),
    net: yen(od.netPayout),
    items: (od.items ?? []).map((it) => ({
      name: it.name,
      qty: it.quantity ?? 1,
      price: yen(it.price),
      options: convCust(it.customizations ?? []),
    })),
  };
}

type RawCust = {
  name: string;
  options?: { name: string; quantity?: number; customizations?: RawCust[] }[];
};

function convCust(cs: RawCust[]): UberOption[] {
  return cs.flatMap((c) =>
    (c.options ?? []).map((o) => ({
      group: c.name,
      name: o.name,
      qty: o.quantity ?? 1,
      ...(o.customizations?.length ? { options: convCust(o.customizations) } : {}),
    })),
  );
}

/** ホットサンドの数。セットの中で選ばれたものも数える */
export function hotsandCount(o: UberOrder): { classic: number; garden: number } {
  const n = { classic: 0, garden: 0 };
  const add = (name: string, q: number) => {
    if (!name.includes("メルト")) return;
    if (name.includes("クラシック")) n.classic += q;
    else if (name.includes("ガーデン")) n.garden += q;
  };
  const walk = (opts: UberOption[], q: number) => {
    for (const op of opts) {
      add(op.name, q * op.qty);
      if (op.options) walk(op.options, q * op.qty);
    }
  };
  for (const it of o.items) {
    add(it.name, it.qty);
    walk(it.options, it.qty);
  }
  return n;
}

/** 完了した注文だけ（キャンセル・不成立は売上にならない） */
export const isCompleted = (o: UberOrder) => o.status.includes("COMPLETED");
