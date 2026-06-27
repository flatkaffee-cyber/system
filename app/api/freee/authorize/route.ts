import { NextRequest, NextResponse } from "next/server";
import { authorizeUrl, isKvReady } from "@/lib/freee";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!process.env.FREEE_CLIENT_ID) {
    return new NextResponse("FREEE_CLIENT_ID が未設定です。", { status: 500 });
  }
  if (!(await isKvReady())) {
    return new NextResponse(
      "トークン保存先（Vercel KV）が未設定です。先に Vercel で KV を追加してください。",
      { status: 500 },
    );
  }
  const origin = new URL(req.url).origin;
  return NextResponse.redirect(authorizeUrl(origin));
}
