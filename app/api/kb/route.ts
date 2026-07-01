import { NextRequest, NextResponse } from "next/server";
import { saveKbEntry, saveDecision, saveReview } from "@/lib/kb";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: {
    txnId?: number;
    date?: string;
    description?: string;
    amount?: number;
    partner?: string;
    lines?: { category: string; amount: number; taxType?: string; item?: string; memo?: string }[];
    kbKeyword?: string;
    kbNote?: string;
    taxReview?: boolean;
    taxReviewReason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const {
    txnId,
    date = "",
    description = "",
    amount = 0,
    partner = "",
    lines = [],
    kbKeyword,
    kbNote = "",
    taxReview = false,
    taxReviewReason = "",
  } = body;
  if (!txnId || lines.length === 0) {
    return NextResponse.json({ error: "決定内容が不足しています" }, { status: 400 });
  }

  // ノウハウを保存（次回同じ取引先を自動提案）
  if (kbKeyword) {
    await saveKbEntry({ keyword: kbKeyword, category: lines[0].category, note: kbNote });
  }
  // 明細の決定を保存
  await saveDecision({
    txnId,
    partner,
    lines,
    note: kbNote,
    decidedAt: new Date(Date.now()).toISOString(),
  });

  // 税理士に相談すべき論点があれば、相談リストに保管
  if (taxReview && taxReviewReason) {
    const treatment = lines
      .map((l) => `${l.category} ¥${l.amount.toLocaleString()}`)
      .join(" / ");
    await saveReview({
      id: String(txnId),
      date,
      summary: `${partner || description}`,
      amount,
      treatment,
      issue: taxReviewReason,
    });
  }

  return NextResponse.json({ ok: true, savedReview: taxReview && !!taxReviewReason });
}
