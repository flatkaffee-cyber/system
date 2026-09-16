import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// KVが何で埋まっているかを見るための、読み取り専用の窓口。
// 容量上限に当たると書き込みが全部止まり、お客さんの申込まで失敗する。

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

/** キー名を「receipt:file:xxx」→「receipt:file:*」のようにまとめる */
function groupOf(key: string): string {
  const parts = key.split(":");
  return parts.length >= 3 ? `${parts[0]}:${parts[1]}:*` : key;
}

export async function GET() {
  const store = await kv();
  if (!store) return NextResponse.json({ error: "KV未設定" }, { status: 500 });

  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = await store.scan(Number(cursor), { count: 1000 });
    keys.push(...(batch as string[]));
    cursor = String(next);
  } while (cursor !== "0" && keys.length < 20000);

  // 大きさは strlen で測る。値が文字列でないキーは 0 として扱う
  const sizes: Record<string, number> = {};
  for (let i = 0; i < keys.length; i += 50) {
    const chunk = keys.slice(i, i + 50);
    const lens = await Promise.all(
      chunk.map(async (k) => {
        try {
          return (await store.strlen(k)) || 0;
        } catch {
          return 0;
        }
      }),
    );
    chunk.forEach((k, j) => (sizes[k] = lens[j]));
  }

  const groups: Record<string, { count: number; bytes: number }> = {};
  for (const k of keys) {
    const g = groupOf(k);
    groups[g] ??= { count: 0, bytes: 0 };
    groups[g].count += 1;
    groups[g].bytes += sizes[k];
  }

  const total = Object.values(sizes).reduce((n, v) => n + v, 0);
  return NextResponse.json({
    keyCount: keys.length,
    totalBytes: total,
    totalMB: +(total / 1024 / 1024).toFixed(1),
    groups: Object.entries(groups)
      .map(([name, v]) => ({ name, ...v, mb: +(v.bytes / 1024 / 1024).toFixed(1) }))
      .sort((a, b) => b.bytes - a.bytes),
    biggest: Object.entries(sizes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, bytes]) => ({ name, kb: +(bytes / 1024).toFixed(0) })),
  });
}
