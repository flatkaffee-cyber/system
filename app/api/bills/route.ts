import { NextRequest, NextResponse } from "next/server";
import {
  getBills,
  saveBill,
  updateBill,
  deleteBill,
  getPayments,
  setPaid,
  getBill,
  currentMonthJst,
  type BillMethod,
} from "@/lib/bills";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/bills?month=YYYY-MM → その月の固定費一覧＋支払状況
export async function GET(req: NextRequest) {
  const month = new URL(req.url).searchParams.get("month") || currentMonthJst();
  const [bills, payments] = await Promise.all([getBills(), getPayments()]);
  const rows = bills
    .filter((b) => b.active && b.startMonth <= month)
    .map((b) => {
      const pay = payments.find((p) => p.billId === b.id && p.month === month) ?? null;
      return { bill: b, payment: pay };
    });
  const allBills = bills; // 解約済み含む全マスター（管理用）
  return NextResponse.json({ month, rows, allBills });
}

// POST /api/bills → 定期請求マスターを新規作成
export async function POST(req: NextRequest) {
  let body: {
    payee?: string;
    category?: string;
    amount?: number;
    method?: BillMethod;
    dueDay?: number;
    memo?: string;
    startMonth?: string;
    image?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const amount = Number(body.amount) || 0;
  if (!body.payee || amount <= 0) {
    return NextResponse.json({ error: "支払先と金額が必要です" }, { status: 400 });
  }
  const id = `b_${Date.now()}`;
  try {
    await saveBill(
      {
        id,
        payee: body.payee,
        category: body.category || "不明",
        amount,
        method: body.method || "その他",
        dueDay: body.dueDay && body.dueDay >= 1 && body.dueDay <= 31 ? body.dueDay : undefined,
        memo: body.memo || "",
        startMonth: body.startMonth || currentMonthJst(),
        active: true,
      },
      body.image,
    );
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "保存に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/bills → 支払い済み切替（paid+month）または マスター更新（update）
export async function PATCH(req: NextRequest) {
  let body: {
    id?: string;
    action?: "paid" | "update";
    month?: string;
    paid?: boolean;
    amount?: number;
    patch?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });

  try {
    if (body.action === "paid") {
      const bill = await getBill(body.id);
      if (!bill) return NextResponse.json({ error: "請求が見つかりません" }, { status: 404 });
      const month = body.month || currentMonthJst();
      const amount = Number(body.amount) || bill.amount;
      const rec = await setPaid(body.id, month, body.paid !== false, amount);
      return NextResponse.json({ ok: true, payment: rec });
    }
    // update
    const ok = await updateBill(body.id, (body.patch ?? {}) as never);
    if (!ok) return NextResponse.json({ error: "更新対象がありません" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "更新に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/bills?id=xxx → マスター削除（月次記録・画像も一緒に）
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
  await deleteBill(id);
  return NextResponse.json({ ok: true });
}
