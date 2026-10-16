import { NextResponse } from "next/server";
import { cronTick } from "@/lib/freeeMirror/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

// 毎分動く（vercel.json の crons）。システムから freee に書き込んだ印があるか、前回から5分たったときだけ
// freee のデータを Supabase に取り込む。ほかの取り込みが動いていれば何もしない。
export async function GET() {
  return NextResponse.json(await cronTick());
}
