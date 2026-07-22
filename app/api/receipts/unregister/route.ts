import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeDelete, isConnected } from "@/lib/freee";
import { getReceipt, clearRegistered } from "@/lib/receipts";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST { id } → freeeの振替伝票を削除し、登録済みフラグを外す（科目修正→再記帳のため）
export async function POST(req: NextRequest) {
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });

  const r = await getReceipt(body.id);
  if (!r) return NextResponse.json({ error: "領収書が見つかりません" }, { status: 404 });
  if (!r.registered) {
    return NextResponse.json({ ok: true, already: true }); // もともと未登録
  }
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続です" }, { status: 400 });
  }

  try {
    await freeeDelete(`/api/1/manual_journals/${r.registered.journalId}`, {
      company_id: String(Number(FREEE_COMPANY_ID)),
    });
    await clearRegistered(body.id);
    return NextResponse.json({ ok: true, deletedJournalId: r.registered.journalId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "取消に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
