import { NextRequest, NextResponse } from "next/server";
import { setTenderFix, type FixMethod } from "@/lib/tenderFix";

export const runtime = "nodejs";

// POST { orderId, method: "cash" | "paypay" | "card" | null }
//   支払い方法の押し間違いを直す。null で直したのを戻す（Square の記録どおりに戻る）
export async function POST(req: NextRequest) {
  try {
    const { orderId, method } = (await req.json()) as { orderId?: string; method?: FixMethod | null };
    if (!orderId) return NextResponse.json({ error: "orderId が必要です" }, { status: 400 });
    if (method !== null && method !== "cash" && method !== "paypay" && method !== "card") {
      return NextResponse.json({ error: "method は cash / paypay / card / null" }, { status: 400 });
    }
    await setTenderFix(orderId, method ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存に失敗" }, { status: 500 });
  }
}
