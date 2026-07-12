import { NextRequest, NextResponse } from "next/server";
import { saveReceipt, getReceipts, deleteReceipt, type RLine } from "@/lib/receipts";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const receipts = await getReceipts();
  return NextResponse.json({ receipts });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
  await deleteReceipt(id);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  let body: {
    date?: string;
    vendor?: string;
    total?: number;
    category?: string;
    summary?: string;
    payer?: string;
    memo?: string;
    image?: string;
    expenseKind?: "company" | "labor";
    laborMember?: string;
    tags?: string[];
    lines?: RLine[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const id = `r_${Date.now()}`;
  const lines = (body.lines ?? [])
    .filter((l) => l && l.amount)
    .map((l) => ({
      name: l.name ?? "",
      amount: Number(l.amount) || 0,
      category: l.category || "不明",
      tags: (l.tags ?? []).filter((t) => t && t.trim()).map((t) => t.trim()),
    }));
  // 互換：旧単一フィールドは内訳から導出
  const total = body.total ?? lines.reduce((s, l) => s + l.amount, 0);
  const compatTags = [...new Set(lines.flatMap((l) => l.tags))];
  try {
    await saveReceipt(
      {
        id,
        date: body.date ?? "",
        vendor: body.vendor ?? "",
        total,
        category: lines[0]?.category ?? body.category ?? "不明",
        summary: body.summary ?? lines.map((l) => l.name).join("、"),
        payer: body.payer ?? "",
        memo: body.memo ?? "",
        expenseKind: body.expenseKind ?? "company",
        laborMember: body.laborMember,
        tags: compatTags.length ? compatTags : body.tags,
        lines: lines.length ? lines : undefined,
      },
      body.image,
    );
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "保存に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
