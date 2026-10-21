import { NextRequest, NextResponse } from "next/server";
import { checkPin } from "@/lib/menuAdmin";
import { createGoods, listGoods, validateGoods, type GoodsInput } from "@/lib/squareGoods";

export const runtime = "nodejs";

// 物販登録の画面の裏側。
// 書き込みはメニュー編集と同じ暗証番号で守る（値段がそのままレジとネットショップに出るため）。

// GET → 登録済みの物販と、サイズごとのいまの在庫
export async function GET() {
  try {
    return NextResponse.json({ items: await listGoods() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "読み込みに失敗" },
      { status: 500 },
    );
  }
}

// POST { pin, name, price, description?, sizes: [{ name, qty }] } → 商品を作って在庫を入れる
export async function POST(req: NextRequest) {
  let b: Partial<GoodsInput> & { pin?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!(await checkPin(b.pin ?? ""))) {
    return NextResponse.json({ error: "暗証番号が違います" }, { status: 401 });
  }
  const bad = validateGoods(b);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  try {
    const created = await createGoods(b as GoodsInput);
    return NextResponse.json({ ok: true, ...created });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "登録に失敗" },
      { status: 500 },
    );
  }
}
