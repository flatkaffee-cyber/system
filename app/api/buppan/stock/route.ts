import { NextRequest, NextResponse } from "next/server";
import { goodsPinError, listGoods, setGoodsStock } from "@/lib/squareGoods";

export const runtime = "nodejs";

// 物販の在庫を直す。色×サイズの種類ごとに「いまの数」を棚卸しで書く。
// POST { pin, changes: [{ variationId, qty }] }
//
// 物販カテゴリの商品の種類だけを受け付ける（ほかの商品の在庫を書きかえないため）。
export async function POST(req: NextRequest) {
  let b: { pin?: string; changes?: { variationId?: string; qty?: number }[] };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const pinErr = await goodsPinError(b.pin ?? "");
  if (pinErr) return NextResponse.json({ error: pinErr }, { status: 401 });

  const changes = b.changes ?? [];
  if (!changes.length) return NextResponse.json({ error: "直す在庫がありません" }, { status: 400 });
  if (changes.some((c) => !c.variationId || !Number.isInteger(c.qty) || (c.qty as number) < 0)) {
    return NextResponse.json({ error: "在庫は0以上の整数で入れてください" }, { status: 400 });
  }

  try {
    const allowed = new Set((await listGoods()).flatMap((i) => i.sizes.map((s) => s.id)));
    if (changes.some((c) => !allowed.has(c.variationId as string))) {
      return NextResponse.json({ error: "物販以外の商品の在庫は、ここでは直せません" }, { status: 400 });
    }
    await setGoodsStock(changes as { variationId: string; qty: number }[]);
    return NextResponse.json({ ok: true, saved: changes.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "在庫を保存できませんでした" },
      { status: 500 },
    );
  }
}
