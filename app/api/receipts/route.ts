import { NextRequest, NextResponse } from "next/server";
import { saveReceipt, getReceipts, deleteReceipt } from "@/lib/receipts";

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
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const id = `r_${Date.now()}`;
  try {
    await saveReceipt(
      {
        id,
        date: body.date ?? "",
        vendor: body.vendor ?? "",
        total: body.total ?? 0,
        category: body.category ?? "不明",
        summary: body.summary ?? "",
        payer: body.payer ?? "",
        memo: body.memo ?? "",
        expenseKind: body.expenseKind ?? "company",
        laborMember: body.laborMember,
        tags: body.tags?.filter((t) => t && t.trim()).map((t) => t.trim()),
      },
      body.image,
    );
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "保存に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
