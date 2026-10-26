import { NextResponse } from "next/server";
import { googleErrorPayload, isGoogleConnected, sheetsGet } from "@/lib/google";
import { SHEET_ID, SHEET_RANGE, parseSheet } from "@/lib/inventorySheet";
import { importFromSheet } from "@/lib/shiireList";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST → 前のGoogleスプレッドシートの仕入れ表を、Supabase に1回だけ取り込む（表が空のときだけ）。
// 移行のためだけにある。取り込んだあとは Google の連携は要らない。
export async function POST() {
  if (!(await isGoogleConnected())) {
    return NextResponse.json({ error: "Google未接続です。再接続してから取り込んでください", needsReauth: true }, { status: 400 });
  }
  try {
    const sections = parseSheet(await sheetsGet(SHEET_ID, SHEET_RANGE));
    const n = await importFromSheet(sections);
    return NextResponse.json({ ok: true, imported: n });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("二重")) return NextResponse.json({ error: msg }, { status: 409 });
    return NextResponse.json(googleErrorPayload(e, "取り込みに失敗"), { status: 500 });
  }
}
