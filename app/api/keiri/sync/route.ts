import { NextResponse } from "next/server";
import { isDbReady } from "@/lib/freeeMirror/db";
import { isStale, needsReconnect } from "@/lib/freeeMirror/health";
import { getMirrorState } from "@/lib/freeeMirror/read";
import { syncFreee } from "@/lib/freeeMirror/sync";

export const runtime = "nodejs";
export const maxDuration = 120;

export type KeiriSyncStatus = {
  configured: boolean; // Supabase が使えるか。使えないあいだ、画面は freee から直接出している
  lastSuccessAt: string | null;
  lastError: string | null;
  stale: boolean;
  reconnect: boolean;
};

async function status(): Promise<KeiriSyncStatus> {
  if (!isDbReady()) return { configured: false, lastSuccessAt: null, lastError: null, stale: false, reconnect: false };
  const s = await getMirrorState();
  return {
    configured: true,
    lastSuccessAt: s.lastSuccessAt,
    lastError: s.lastError,
    stale: isStale(s, Date.now()),
    reconnect: needsReconnect(s.lastError),
  };
}

// GET: 取り込みの状態（経理画面の「最終取り込み」）
export async function GET() {
  try {
    return NextResponse.json(await status());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "読み込みに失敗しました" }, { status: 500 });
  }
}

// POST: 今すぐ取り込む。終わるまで待って、結果と状態を返す
export async function POST() {
  try {
    const result = await syncFreee("manual");
    return NextResponse.json({ ...result, status: await status() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "取り込みに失敗しました" }, { status: 500 });
  }
}
