import { NextRequest, NextResponse } from "next/server";
import { createItem, listCategories, listItems, updateItem, updateVariations } from "@/lib/squareCatalog";
import { getHidden, setHidden } from "@/lib/menuAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

// セットの作り直し（2026-10-26 坂本さん決定）。1回だけ使う移行用。
//   GET  → 何をするかを見るだけ
//   POST → 実行。もう作ってあるもの・名前を変えてあるものは飛ばすので、2回押しても二重にならない
// 中身：
//   1. 差額の商品（ドリンクセット +¥450、スープセットorフルセット +¥300/+¥350）の名前を「（旧）…」に変えて注文画面から外す（消さない）
//   2. スープセット ¥1,100・ドリンクセット ¥1,250・フルセット ¥1,600 を「🥪 昼の部」に作る。種類はクラシックメルト／ガーデンメルト
const SETS = [
  { name: "スープセット", price: 1100 },
  { name: "ドリンクセット", price: 1250 },
  { name: "フルセット", price: 1600 },
];
const OLD = [
  { id: "6Y5ACRRWFSNH4XEM2J3QRUYI", rename: "（旧）ドリンクセット差額" },
  { id: "6WJJWUTTBO3BDF4UPXAL6SWL", rename: "（旧）スープセット・フルセット差額" },
];

async function plan() {
  const [items, cats, hidden] = await Promise.all([listItems(), listCategories(), getHidden()]);
  const cat = cats.find((c) => c.name.includes("昼の部")) ?? null;
  const old = OLD.map((o) => {
    const it = items.find((i) => i.id === o.id);
    return { ...o, now: it?.name ?? null, renamed: it?.name === o.rename, hidden: hidden.includes(o.id) };
  });
  const sets = SETS.map((s) => {
    const it = items.find(
      (i) => i.name === s.name && i.variations.some((v) => v.name === "クラシックメルト") && i.variations.some((v) => v.name === "ガーデンメルト"),
    );
    return { ...s, existsId: it?.id ?? null };
  });
  return { category: cat, old, sets };
}

export async function GET() {
  try {
    return NextResponse.json(await plan());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "取得に失敗" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const p = await plan();
    if (!p.category) return NextResponse.json({ error: "「昼の部」の大分類が見つかりません" }, { status: 400 });
    const done: string[] = [];
    for (const o of p.old) {
      if (!o.now) continue;
      if (!o.renamed) {
        await updateItem(o.id, { name: o.rename });
        done.push(`名前を変えた: ${o.now} → ${o.rename}`);
      }
      if (!o.hidden) {
        await setHidden(o.id, true);
        done.push(`注文画面から外した: ${o.rename}`);
      }
    }
    for (const s of p.sets) {
      if (s.existsId) continue;
      const it = await createItem(s.name, s.price, p.category.id);
      await updateVariations(it.id, [
        { id: it.variations[0].id, name: "クラシックメルト", price: s.price },
        { name: "ガーデンメルト", price: s.price },
      ]);
      done.push(`作った: ${s.name} ¥${s.price.toLocaleString()}（クラシックメルト／ガーデンメルト）`);
    }
    return NextResponse.json({ ok: true, done, after: await plan() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "実行に失敗" }, { status: 500 });
  }
}
