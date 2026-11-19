// 支払い方法の押し間違いを直す（2026-11-20 坂本さん）
// flat のレジで「現金」と「PayPay」を押し間違えたとき、Square の記録は会計済みなので変えられない。
// 返金して打ち直すと日付がずれるので、システムの中でだけ支払い方法を差し替える。
// 売上・レジ締め・売上の仕訳（/api/sales-journal は /api/square/sales を読む）がこれで揃う。

const KEY = "square:tenderFix";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type FixMethod = "cash" | "paypay" | "card";
export type TenderFix = { method: FixMethod; at: string };

export const METHOD_LABEL: Record<FixMethod, string> = { cash: "現金", paypay: "PayPay", card: "カード" };

export async function getTenderFixes(): Promise<Record<string, TenderFix>> {
  const store = await kv();
  if (!store) return {};
  try {
    return (await store.hgetall<Record<string, TenderFix>>(KEY)) ?? {};
  } catch {
    return {};
  }
}

export async function setTenderFix(orderId: string, method: FixMethod | null): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  if (method === null) await store.hdel(KEY, orderId);
  else await store.hset(KEY, { [orderId]: { method, at: new Date().toISOString() } });
}

/** Square の tender を、直した支払い方法に差し替える（1回払いの注文だけ。分けて払った注文は触らない） */
export function applyTenderFix<T extends { type: string; note?: string }>(tenders: T[], fix: TenderFix | undefined): T[] {
  if (!fix || tenders.length !== 1) return tenders;
  const t = tenders[0];
  if (fix.method === "cash") return [{ ...t, type: "CASH", note: "" }];
  if (fix.method === "card") return [{ ...t, type: "CARD", note: "" }];
  return [{ ...t, type: "OTHER", note: "PayPay" }];
}
