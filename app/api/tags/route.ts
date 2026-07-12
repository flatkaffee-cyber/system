import { NextResponse } from "next/server";
import { getReceipts } from "@/lib/receipts";
import { getDecisions } from "@/lib/kb";

export const runtime = "nodejs";

// 既存の用途タグ一覧（フォームの候補用）
export async function GET() {
  const set = new Set<string>();
  const receipts = await getReceipts();
  for (const r of receipts) for (const t of r.tags ?? []) if (t) set.add(t);
  const decisions = await getDecisions();
  for (const d of Object.values(decisions)) for (const t of d.tags ?? []) if (t) set.add(t);
  return NextResponse.json({ tags: [...set].sort() });
}
