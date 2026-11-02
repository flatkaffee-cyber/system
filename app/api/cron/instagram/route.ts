import { NextRequest, NextResponse } from "next/server";
import { runDue } from "@/lib/instagram";

export const runtime = "nodejs";
export const maxDuration = 120;

// インスタの定期ストーリー。5分おきにVercelのcronが呼ぶ。
// 時刻を過ぎた枠があれば上げる。無ければ何もしないので、何度走っても実害はない。
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(await runDue(req.nextUrl.origin));
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "失敗" },
      { status: 500 },
    );
  }
}
