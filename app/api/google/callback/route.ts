import { NextRequest, NextResponse } from "next/server";
import { googleExchange } from "@/lib/google";
import { connectGbp } from "@/lib/googleBusiness";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return new NextResponse("認証コードがありません。", { status: 400 });

  // Googleマップの店につなぐとき（/api/google-business/authorize から）
  const state = url.searchParams.get("state") || "";
  if (state.startsWith("gbp:")) {
    if (state.slice(4) !== req.cookies.get("gbp_state")?.value) {
      return new NextResponse("接続をやり直してください。", { status: 400 });
    }
    let note = "google=1";
    try {
      await connectGbp(url.origin, code);
    } catch (e) {
      note = `googleError=${encodeURIComponent(e instanceof Error ? e.message : "エラー")}`;
    }
    const res = NextResponse.redirect(`${url.origin}/instagram?${note}`);
    res.cookies.delete("gbp_state");
    return res;
  }

  try {
    await googleExchange(url.origin, code);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "エラー";
    return new NextResponse(`Gmail接続に失敗しました：${msg}`, { status: 500 });
  }
  return NextResponse.redirect(`${url.origin}/meisai?gmail=1`);
}
