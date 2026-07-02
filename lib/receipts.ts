// 領収書（立替）の保存。原本画像＋抽出データをKVに貯める。
// 整理（月フォルダ等）はNAS導入時にまとめて行う前提。今は「消えないように保存」だけが目的。

const IDX = "receipts:index";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type SavedReceipt = {
  id: string;
  date: string;
  vendor: string;
  total: number;
  category: string;
  summary: string;
  payer: string;
  memo: string;
  savedAt: string;
};

export async function getReceipts(): Promise<SavedReceipt[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<SavedReceipt[]>(IDX)) ?? [];
}

export async function saveReceipt(
  r: Omit<SavedReceipt, "savedAt">,
  imageDataUrl?: string,
): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const index = await getReceipts();
  index.unshift({ ...r, savedAt: new Date(Date.now()).toISOString() });
  await store.set(IDX, index);
  // 原本画像（dataURL）は別キー。大きすぎればデータのみ（NAS導入時に対応）。
  if (imageDataUrl && imageDataUrl.length < 6_000_000) {
    try {
      await store.set(`receipt:file:${r.id}`, imageDataUrl);
    } catch {
      // 原本保存失敗はスルー（抽出データは保存済み）
    }
  }
}

export async function getReceiptImage(id: string): Promise<string | null> {
  const store = await kv();
  if (!store) return null;
  return (await store.get<string>(`receipt:file:${id}`)) ?? null;
}
