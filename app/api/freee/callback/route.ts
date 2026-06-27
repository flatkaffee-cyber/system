import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/freee";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return new NextResponse("認証コードがありません。", { status: 400 });
  }
  try {
    await exchangeCode(url.origin, code);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "エラー";
    return new NextResponse(`freee接続に失敗しました：${msg}`, { status: 500 });
  }
  // 接続成功 → 払うものリストへ
  return NextResponse.redirect(`${url.origin}/payables?connected=1`);
}
