import { NextRequest, NextResponse } from "next/server";
import { gbpAuthorizeUrl } from "@/lib/googleBusiness";

export const runtime = "nodejs";

// Googleマップの店につなぐ入口。/instagram の「つなぐ」から来る。
// 戻り先の /api/google/callback は合言葉なしで開けるので、stateで本人の操作かを確かめる
export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const nonce = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const res = NextResponse.redirect(gbpAuthorizeUrl(origin, `gbp:${nonce}`));
  res.cookies.set("gbp_state", nonce, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
