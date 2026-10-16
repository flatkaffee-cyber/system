import { NextResponse } from "next/server";
import { syncFreee } from "@/lib/freeeMirror/sync";

export const runtime = "nodejs";
export const maxDuration = 120;

// 5分おきに freee のデータを Supabase に取り込む（vercel.json の crons）。
// ほかの取り込みが動いていれば何もしない。
export async function GET() {
  return NextResponse.json(await syncFreee("cron"));
}
