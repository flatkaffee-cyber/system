import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, freeePost, isConnected } from "@/lib/freee";
import { mapCategory } from "@/lib/freeeMap";
import { getBill, getPayment, markBillRegistered, currentMonthJst, isAutoMethod, type BillMethod } from "@/lib/bills";

export const runtime = "nodejs";
export const maxDuration = 30;

const COMPANY = Number(FREEE_COMPANY_ID);

// 支払方法 → 貸方の勘定科目名（freeeから実IDを引く）
function creditAccountName(method: BillMethod): string {
  switch (method) {
    case "口座振替":
    case "振込":
      return "普通預金";
    case "コンビニ":
      return "現金";
    case "カード":
      return "未払金";
    default:
      return "未払金";
  }
}

type AccountItem = { id: number; name: string };

async function findAccountId(name: string): Promise<number | null> {
  const r = await freeeGet<{ account_items: AccountItem[] }>("/api/1/account_items", {
    company_id: String(COMPANY),
  });
  const exact = r.account_items.find((a) => a.name === name);
  if (exact) return exact.id;
  const partial = r.account_items.find((a) => a.name.includes(name));
  return partial?.id ?? null;
}

// POST /api/bills/register { id, month } → その月の支払いをfreeeに記帳
export async function POST(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続です" }, { status: 400 });
  }
  let body: { id?: string; month?: string; issueDate?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });

  const bill = await getBill(body.id);
  if (!bill) return NextResponse.json({ error: "請求が見つかりません" }, { status: 404 });

  const month = body.month || currentMonthJst();
  const pay = await getPayment(bill.id, month);
  if (pay?.registered) {
    return NextResponse.json({ ok: true, already: true, journalId: pay.registered.journalId });
  }
  const amount = pay?.amount || bill.amount;
  if (amount <= 0) return NextResponse.json({ error: "金額が不足しています" }, { status: 400 });

  // 記帳日：支払日があればその日、なければ対象月の支払目安日 or 月初
  const issueDate =
    body.issueDate ||
    (bill.dueDay ? `${month}-${String(bill.dueDay).padStart(2, "0")}` : `${month}-01`);

  const debit = mapCategory(bill.category); // 借)科目（保険料 等）
  const creditName = creditAccountName(bill.method);
  const creditId = await findAccountId(creditName);
  if (!creditId) {
    return NextResponse.json(
      { error: `freeeに勘定科目「${creditName}」が見つかりません。freee側で科目を確認してください。` },
      { status: 400 },
    );
  }

  const desc = `${bill.payee} ${month}分（${bill.method}）`.slice(0, 100);
  const journal = {
    company_id: COMPANY,
    issue_date: issueDate,
    details: [
      { entry_side: "debit", account_item_id: debit.accountItemId, tax_code: debit.taxCode, amount, description: desc },
      { entry_side: "credit", account_item_id: creditId, tax_code: 2, amount, description: desc },
    ],
  };

  try {
    const res = await freeePost<{ manual_journal: { id: number } }>("/api/1/manual_journals", journal);
    const journalId = res.manual_journal?.id;
    if (journalId) await markBillRegistered(bill.id, month, journalId, amount);
    return NextResponse.json({ ok: true, journalId, credit: creditName, autoPay: isAutoMethod(bill.method) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "登録に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
