import { NextResponse } from "next/server";
import { getReceipts } from "@/lib/receipts";
import { getDecisions } from "@/lib/kb";

export const runtime = "nodejs";

type Item = { date: string; name: string; amount: number; source: "領収書" | "明細" };

// 用途タグ別の集計（合計・件数・内訳）
export async function GET() {
  const byTag: Record<string, { total: number; items: Item[] }> = {};
  const add = (tags: string[] | undefined, item: Item) => {
    for (const t of tags ?? []) {
      if (!t) continue;
      if (!byTag[t]) byTag[t] = { total: 0, items: [] };
      byTag[t].total += item.amount;
      byTag[t].items.push(item);
    }
  };

  const receipts = await getReceipts();
  for (const r of receipts) {
    add(r.tags, { date: r.date, name: r.vendor || r.summary || "領収書", amount: r.total, source: "領収書" });
  }
  const decisions = await getDecisions();
  for (const d of Object.values(decisions)) {
    const amount = d.amount ?? d.lines.reduce((s, l) => s + (l.amount || 0), 0);
    add(d.tags, {
      date: d.date ?? "",
      name: d.partner || d.description || "明細",
      amount,
      source: "明細",
    });
  }

  const tags = Object.entries(byTag)
    .map(([tag, v]) => ({
      tag,
      total: v.total,
      count: v.items.length,
      items: v.items.sort((a, b) => (a.date < b.date ? -1 : 1)),
    }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({ tags });
}
