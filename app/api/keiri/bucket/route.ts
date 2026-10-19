import { NextRequest, NextResponse } from "next/server";
import { setOverride } from "@/lib/monthlyReport";
import type { Bucket } from "@/lib/keiri/buckets";

export const runtime = "nodejs";

const KEY_RE = /^(?:(?:deal|journal):\d+:\d+|row:[\w-]+)$/;
const BUCKETS: (Bucket | null)[] = ["regular", "event", "irregular", null];

// PUT { keys, bucket } … 経理画面の表の行の区分（店舗・イベント・臨時）を付け替える。bucket が null なら自動に戻す。
// 鍵は月次レポートの付け替えと同じ保存先に入るので、両方の画面の数字がいっしょに動く
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { keys?: unknown; bucket?: unknown } | null;
  const keys = Array.isArray(body?.keys) ? (body.keys as unknown[]) : [];
  const bucket = body?.bucket === undefined ? undefined : (body.bucket as Bucket | null);
  const okKeys = keys.length > 0 && keys.length <= 50 && keys.every((k) => typeof k === "string" && KEY_RE.test(k));
  if (!okKeys || bucket === undefined || !BUCKETS.includes(bucket)) {
    return NextResponse.json({ error: "付け替えの指定が正しくありません" }, { status: 400 });
  }
  try {
    for (const k of keys as string[]) await setOverride(k, bucket);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存できませんでした" }, { status: 500 });
  }
}
