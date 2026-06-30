import { NextRequest, NextResponse } from "next/server";
import { gmailSearch, isGoogleConnected } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await isGoogleConnected())) {
    return NextResponse.json({ connected: false, mails: [] });
  }
  let body: { amount?: number; description?: string; keyword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const amount = body.amount ?? 0;
  const keyword = (body.keyword ?? "").trim();

  // 金額をいくつかの表記でOR検索（明細のカナ摘要は当てにならないので金額が主キー）
  const a = amount.toLocaleString();
  const amountTerms = [`"${a}"`, `"${amount}"`, `"${a}円"`, `"¥${a}"`].join(" OR ");
  const query = `(${amountTerms})${keyword ? ` ${keyword}` : ""}`;

  try {
    const mails = await gmailSearch(query, 4);
    return NextResponse.json({ connected: true, query, mails });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "エラー";
    return NextResponse.json({ connected: true, error: msg, mails: [] });
  }
}
