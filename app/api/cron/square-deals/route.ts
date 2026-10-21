import { NextRequest, NextResponse } from "next/server";
import { passAuth } from "@/lib/internalFetch";

export const runtime = "nodejs";
export const maxDuration = 300;

// 2026-10-21 定期実行（vercel.json）から外した。使わないこと。
// Square の振込は「Square売掛金」（Square 連携がカード売上を入れる口座）からの口座振替で消し込むのが正しい。
// ここで作っていた「売掛金」の取引で消し込むと、売掛金がマイナスに、Square売掛金がプラスにふくらむ
// （8〜10月の10件 ¥448,124 を訂正の振替伝票で直した）。
//
// （以下、もとの説明）毎週月曜の朝、Squareからの振込明細に「売掛金の未決済取引」を自動で作る。
// 売上と手数料はfreeeのSquare連携が計上済みなので、振込は売掛金の回収として
// 消し込むだけでよい。取引を作っておけば、freeeでは消込を選んで登録するだけになる。
// 一度作った明細はmake-deal側のKV記録でスキップされるので、何度呼んでも安全。
export async function GET(req: NextRequest) {
  try {
    const origin = req.nextUrl.origin;
    const res = await fetch(`${origin}/api/freee/make-deal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...passAuth(req) },
      body: JSON.stringify({
        match: "スクエア",
        category: "売掛金",
        side: "income",
        dryRun: false,
      }),
    });
    const d = await res.json();
    return NextResponse.json({ ok: res.ok, ...d });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "エラー" },
      { status: 500 },
    );
  }
}
