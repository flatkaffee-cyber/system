import { NextRequest, NextResponse } from "next/server";
import { runDue, syncFeedToGoogle } from "@/lib/instagram";

export const runtime = "nodejs";
export const maxDuration = 120;

// インスタの定期ストーリー。5分おきにVercelのcronが呼ぶ。
// 時刻を過ぎた枠があれば上げる。無ければ何もしないので、何度走っても実害はない。
export async function GET(req: NextRequest) {
  try {
    const stories = await runDue(req.nextUrl.origin);
    // ストーリーの結果に影響させない
    const feed = await syncFeedToGoogle().catch((e) => ({ ok: false, error: String(e) }));
    return NextResponse.json({ ...stories, feed });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "失敗" },
      { status: 500 },
    );
  }
}
