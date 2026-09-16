import { NextRequest, NextResponse } from "next/server";
import { migrateKey, blobEnabled } from "@/lib/fileStore";

export const runtime = "nodejs";
export const maxDuration = 60;

// KVに溜まったファイルをBlobへ移す。
// 1回では終わらないので、少しずつ呼んで進める。
// 1件ごとに「Blobへ入れた → 確かめた → KVから消す」の順でやるので、
// 途中で止まってもファイルが消えることはない。

const PREFIXES = ["receipt:file:", "contract:file:", "bill:file:", "companydoc:file:", "contact:image:"];

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

async function pendingKeys(): Promise<string[]> {
  const store = await kv();
  if (!store) return [];
  const keys: string[] = [];
  let cursor = 0;
  do {
    const [next, batch] = await store.scan(cursor, { count: 1000 });
    keys.push(...(batch as string[]));
    cursor = Number(next);
  } while (cursor !== 0 && keys.length < 20000);
  return keys.filter((k) => PREFIXES.some((p) => k.startsWith(p)));
}

// GET → あと何件残っているか
export async function GET() {
  const keys = await pendingKeys();
  return NextResponse.json({ blobEnabled: blobEnabled(), remaining: keys.length, keys: keys.slice(0, 5) });
}

// POST { limit } → その件数だけ移す
export async function POST(req: NextRequest) {
  if (!blobEnabled()) {
    return NextResponse.json({ error: "Blobが未設定です" }, { status: 500 });
  }
  const { limit } = (await req.json().catch(() => ({}))) as { limit?: number };
  const n = Math.min(Math.max(1, Math.floor(limit ?? 10)), 40);

  const keys = await pendingKeys();
  const done: { key: string; kb: number }[] = [];
  const failed: { key: string; error: string }[] = [];
  let freed = 0;

  for (const key of keys.slice(0, n)) {
    try {
      const size = await migrateKey(key);
      if (size > 0) {
        freed += size;
        done.push({ key, kb: Math.round(size / 1024) });
      } else {
        failed.push({ key, error: "移せませんでした" });
      }
    } catch (e) {
      failed.push({ key, error: e instanceof Error ? e.message : "失敗" });
    }
  }

  return NextResponse.json({
    moved: done.length,
    freedMB: +(freed / 1024 / 1024).toFixed(1),
    remaining: keys.length - done.length,
    done,
    failed,
  });
}
