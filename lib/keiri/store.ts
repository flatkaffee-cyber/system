// 月次の表の「行の色とメモ」「経理メモ」を KV に保存する。決まりは notes.ts。
// KV が無い環境では、読むと空、書くとエラー（lib/pending-expenses.ts と同じ作り）。
import type { KeiriMemo, RowMarks } from "./notes";

const MARKS = (month: string) => `keiri:marks:${month}`;
const MEMOS = "keiri:memos";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

async function mustKv() {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  return store;
}

export async function getMarks(month: string): Promise<RowMarks> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<RowMarks>(MARKS(month))) ?? {};
}

/** 印が1つも無くなった月はキーごと消す */
export async function saveMarks(month: string, marks: RowMarks): Promise<void> {
  const store = await mustKv();
  if (Object.keys(marks).length === 0) await store.del(MARKS(month));
  else await store.set(MARKS(month), marks);
}

export async function getMemos(): Promise<KeiriMemo[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<KeiriMemo[]>(MEMOS)) ?? [];
}

export async function saveMemos(memos: KeiriMemo[]): Promise<void> {
  const store = await mustKv();
  await store.set(MEMOS, memos);
}
