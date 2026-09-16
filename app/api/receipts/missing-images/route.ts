import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { getReceipts } from "@/lib/receipts";

export const runtime = "nodejs";
export const maxDuration = 60;

// 原本画像が残っていない領収書を洗い出す。
// KVが満杯だった期間は、データだけ保存されて写真が落ちていた。
// 紙が残っているものだけ撮り直せるように、対象を絞る。

export async function GET() {
  const saved = new Set<string>();
  let cursor: string | undefined;
  do {
    const r = await list({ prefix: "receipt/file/", cursor, limit: 1000 });
    for (const b of r.blobs) saved.add(b.pathname.replace("receipt/file/", ""));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);

  const receipts = await getReceipts();
  const missing = receipts
    .filter((r) => !saved.has(r.id))
    .map((r) => ({
      id: r.id,
      date: r.date,
      vendor: r.vendor,
      total: r.total,
      payer: r.payer,
      savedAt: r.savedAt,
    }))
    .sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));

  return NextResponse.json({
    receipts: receipts.length,
    withImage: saved.size,
    missing: missing.length,
    list: missing,
  });
}
