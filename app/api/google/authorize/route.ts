import { NextRequest, NextResponse } from "next/server";
import { googleAuthorizeUrl, isGoogleReady } from "@/lib/google";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await isGoogleReady())) {
    return new NextResponse(
      "GOOGLE_CLIENT_ID または トークン保存先(KV)が未設定です。",
      { status: 500 },
    );
  }
  const origin = new URL(req.url).origin;
  return NextResponse.redirect(googleAuthorizeUrl(origin));
}
