import { NextRequest, NextResponse } from "next/server";
import { saveKbEntry, saveDecision } from "@/lib/kb";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: {
    txnId?: number;
    partner?: string;
    lines?: { category: string; amount: number }[];
    kbKeyword?: string;
    kbNote?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const { txnId, partner = "", lines = [], kbKeyword, kbNote = "" } = body;
  if (!txnId || lines.length === 0) {
    return NextResponse.json({ error: "決定内容が不足しています" }, { status: 400 });
  }

  // ノウハウを保存（次回同じ取引先を自動提案）
  if (kbKeyword) {
    await saveKbEntry({
      keyword: kbKeyword,
      category: lines[0].category,
      note: kbNote,
    });
  }
  // 明細の決定を保存
  await saveDecision({
    txnId,
    partner,
    lines,
    note: kbNote,
    decidedAt: new Date(Date.now()).toISOString(),
  });

  return NextResponse.json({ ok: true });
}
