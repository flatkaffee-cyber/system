import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, freeePost, isConnected } from "@/lib/freee";
import { getReceipt, markRegistered, receiptLines } from "@/lib/receipts";
import { mapCategory, clampIssueDate, YAKUIN_KARIIRE_ID, YAKUIN_KARIIRE_TAX } from "@/lib/freeeMap";

export const runtime = "nodejs";
export const maxDuration = 30;

const COMPANY = Number(FREEE_COMPANY_ID);

// 立替えた人を取引先として解決（無ければ作成）
async function resolvePartnerId(name: string): Promise<number | undefined> {
  if (!name) return undefined;
  try {
    const list = await freeeGet<{ partners: { id: number; name: string }[] }>(
      "/api/1/partners",
      { company_id: String(COMPANY), keyword: name, limit: "50" },
    );
    const hit = list.partners?.find((p) => p.name === name);
    if (hit) return hit.id;
    const created = await freeePost<{ partner: { id: number } }>("/api/1/partners", {
      company_id: COMPANY,
      name,
    });
    return created.partner?.id;
  } catch {
    return undefined; // 取引先解決に失敗しても登録は続行（取引先なし）
  }
}

export async function POST(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続です" }, { status: 400 });
  }
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });

  const r = await getReceipt(body.id);
  if (!r) return NextResponse.json({ error: "領収書が見つかりません" }, { status: 404 });
  if (r.registered) {
    return NextResponse.json({ ok: true, already: true, journalId: r.registered.journalId });
  }
  if (!r.date || !r.total) {
    return NextResponse.json({ error: "日付・金額が不足しています" }, { status: 400 });
  }

  const partnerId = await resolvePartnerId(r.payer);
  // 設立前(期首前)の支出はfreeeが受け付けないので、発生日を期首日に丸める。
  const { issueDate, adjusted, original } = clampIssueDate(r.date);
  const dateNote = adjusted ? `（原本日付${original}・設立前支出）` : "";
  const desc = ((r.memo || r.summary || r.vendor || "") + dateNote).slice(0, 100);

  // 内訳（用途/科目ごと）→ 借方を複数行に。合計＝貸)役員借入金1行。
  const lines = receiptLines(r);
  const debitDetails = lines.map((l) => {
    const m = mapCategory(l.category);
    return {
      entry_side: "debit",
      account_item_id: m.accountItemId,
      tax_code: m.taxCode,
      amount: l.amount,
      ...(m.itemId ? { item_id: m.itemId } : {}),
      description: (l.name || desc).slice(0, 100),
    };
  });
  const total = lines.reduce((s, l) => s + l.amount, 0);

  // 振替伝票: 借)科目（内訳分だけ複数行） / 貸)役員借入金（取引先＝立替えた人）
  const journal = {
    company_id: COMPANY,
    issue_date: issueDate,
    details: [
      ...debitDetails,
      {
        entry_side: "credit",
        account_item_id: YAKUIN_KARIIRE_ID,
        tax_code: YAKUIN_KARIIRE_TAX,
        amount: total,
        ...(partnerId ? { partner_id: partnerId } : {}),
        description: desc,
      },
    ],
  };

  try {
    const res = await freeePost<{ manual_journal: { id: number } }>(
      "/api/1/manual_journals",
      journal,
    );
    const journalId = res.manual_journal?.id;
    if (journalId) await markRegistered(r.id, journalId);
    return NextResponse.json({
      ok: true,
      journalId,
      partnerId: partnerId ?? null,
      dateAdjusted: adjusted,
      issueDate,
      originalDate: original,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "登録に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
