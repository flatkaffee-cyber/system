import { NextRequest, NextResponse } from "next/server";
import { googleExchange } from "@/lib/google";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return new NextResponse("認証コードがありません。", { status: 400 });
  try {
    await googleExchange(url.origin, code);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "エラー";
    return new NextResponse(`Gmail接続に失敗しました：${msg}`, { status: 500 });
  }
  return NextResponse.redirect(`${url.origin}/meisai?gmail=1`);
}
