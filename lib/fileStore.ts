// 領収書の原本画像などの「重いファイル」の置き場。
//
// もともとKV（Redis）にdataURLのまま入れていた。1枚1MB前後あるので
// 256MBの上限をすぐ使い切り、容量を超えた時点で書き込みが全部止まる。
// お客さんのイベント申込まで保存できなくなったので、ファイルはBlobへ移した。
//
// KVは文字データだけを持つ。読むときは Blob → 無ければ KV の順で探すので、
// 移行が済んでいないものもそのまま読める。

import { put, del, head } from "@vercel/blob";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export function blobEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** KVのキー（receipt:file:xxx）を、Blobの置き場所（receipt/file/xxx）に直す */
function pathOf(key: string): string {
  return key.replace(/:/g, "/");
}

/** dataURL からファイルの中身と種類を取り出す */
function parseDataUrl(dataUrl: string): { body: Buffer; contentType: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  return { body: Buffer.from(m[2], "base64"), contentType: m[1] };
}

/**
 * ファイルを保存する。Blobが使えればBlobへ、無ければ今までどおりKVへ。
 * 返すのは保存できたかどうか。
 */
export async function putFile(key: string, dataUrl: string): Promise<boolean> {
  if (blobEnabled()) {
    const parsed = parseDataUrl(dataUrl);
    if (parsed) {
      try {
        await put(pathOf(key), parsed.body, {
          access: "public", // ストア自体が非公開なので、URLを知っていても開けない
          contentType: parsed.contentType,
          addRandomSuffix: false,
          allowOverwrite: true,
        });
        return true;
      } catch {
        /* Blobに入らなければKVへ落とす */
      }
    }
  }
  const store = await kv();
  if (!store) return false;
  try {
    await store.set(key, dataUrl);
    return true;
  } catch {
    // 容量超過など。ファイルが入らなくても、抽出したデータは残す
    return false;
  }
}

/** ファイルを読む。Blob → KV の順に探し、dataURLで返す */
export async function getFile(key: string): Promise<string | null> {
  if (blobEnabled()) {
    try {
      const info = await head(pathOf(key));
      if (info?.url) {
        const res = await fetch(info.url);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const type = res.headers.get("content-type") || "image/jpeg";
          return `data:${type};base64,${buf.toString("base64")}`;
        }
      }
    } catch {
      /* Blobに無ければKVを見る */
    }
  }
  const store = await kv();
  if (!store) return null;
  return (await store.get<string>(key)) ?? null;
}

/** ファイルを消す。両方から消す */
export async function delFile(key: string): Promise<void> {
  if (blobEnabled()) {
    try {
      await del(pathOf(key));
    } catch {
      /* 無ければそのまま */
    }
  }
  const store = await kv();
  if (store) {
    try {
      await store.del(key);
    } catch {
      /* 無ければそのまま */
    }
  }
}

/**
 * KVにあるファイルをBlobへ移す。移せたらKVから消して容量を空ける。
 * 戻り値は移したバイト数（移せなかったら0）。
 */
export async function migrateKey(key: string): Promise<number> {
  if (!blobEnabled()) return 0;
  const store = await kv();
  if (!store) return 0;
  const dataUrl = await store.get<string>(key);
  if (!dataUrl || typeof dataUrl !== "string") return 0;

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return 0;
  await put(pathOf(key), parsed.body, {
    access: "public",
    contentType: parsed.contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  // Blobに入ったことを確かめてからKVを消す
  const info = await head(pathOf(key));
  if (!info?.url) return 0;
  const size = dataUrl.length;
  await store.del(key);
  return size;
}
