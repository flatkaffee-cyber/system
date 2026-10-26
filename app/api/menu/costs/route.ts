import { NextRequest, NextResponse } from "next/server";
import { passAuth } from "@/lib/internalFetch";
import { getOverrides } from "@/lib/freeeItems";
import { getMenuItems, isPlausiblePrice, linkOf, updateIngredient } from "@/lib/menu";
import { unitPriceOf } from "@/lib/unitPrice";

export const runtime = "nodejs";
export const maxDuration = 60;

type Buy = { date: string; vendor: string; name: string; amount: number; category: string; from: string; qty?: number };
type Ledger = { item: string; count: number; buys: Buy[]; categories: string[] };

// GET → 材料ごとに、レシピの仕入値と、品目台帳の最近の買値（1個あたり）を並べる。
//        原価がレシートから来ているか・ずれていないかを見るための画面（メニュー → 原価の見直し）用
export async function GET(req: NextRequest) {
  try {
    const [menu, overrides, ledRes] = await Promise.all([
      getMenuItems(),
      getOverrides().catch(() => ({})),
      fetch(`${req.nextUrl.origin}/api/items-ledger`, { cache: "no-store", headers: passAuth(req) }),
    ]);
    const led = (await ledRes.json()) as { ledgers?: Ledger[] };
    const ledgers = new Map((led.ledgers ?? []).map((l) => [l.item, l]));

    // 同じ名前の材料は1行にまとめる（どのメニューで使っているかを添える）
    const byName = new Map<string, { ing: (typeof menu)[number]["ingredients"][number]; usedIn: string[] }>();
    for (const m of menu) {
      for (const ing of m.ingredients) {
        const cur = byName.get(ing.name);
        if (cur) cur.usedIn.push(m.name);
        else byName.set(ing.name, { ing, usedIn: [m.name] });
      }
    }

    const rows = [...byName.values()].map(({ ing, usedIn }) => {
      const link = linkOf(ing, overrides);
      const l = link ? ledgers.get(link) : undefined;
      const latest = l?.buys
        .filter((b) => b.amount > 0)
        .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      const up = latest ? unitPriceOf(latest.name, latest.amount, latest.qty) : null;
      const diffPct = up && ing.purchasePrice ? Math.round(((up.price - ing.purchasePrice) / ing.purchasePrice) * 100) : null;
      return {
        name: ing.name,
        unit: ing.unit,
        capacity: ing.capacity,
        purchasePrice: ing.purchasePrice,
        priceFrom: ing.priceFrom ?? null,
        usedIn,
        link,
        linkManual: !!ing.ledgerItem,
        linkFound: !!l,
        latest: latest && up
          ? { date: latest.date, vendor: latest.vendor, name: latest.name, unitPrice: up.price, qty: up.qty }
          : null,
        diffPct,
        // 自動では入らない大きなずれ（1パックの量が違う品の可能性）
        bigGap: !!(up && ing.purchasePrice && !isPlausiblePrice(ing.purchasePrice, up.price)),
      };
    });

    // つなぎ先の候補：仕入高の買い物がある品目（食材・飲み物）
    const choices = (led.ledgers ?? [])
      .filter((l) => l.categories.includes("仕入高"))
      .map((l) => l.item)
      .sort((a, b) => a.localeCompare(b, "ja"));

    return NextResponse.json({ rows, choices });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "取得に失敗" }, { status: 500 });
  }
}

// POST { name, ledgerItem?: string|null, purchasePrice?, priceFrom? }
//   → その名前の材料を全部のメニューでまとめて直す（つなぎ先・仕入値）
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      name?: string;
      ledgerItem?: string | null;
      purchasePrice?: number;
      priceFrom?: { date: string; name: string; vendor?: string };
    };
    if (!b.name) return NextResponse.json({ error: "材料の名前が必要です" }, { status: 400 });
    const n = await updateIngredient(b.name, {
      ...(b.ledgerItem !== undefined ? { ledgerItem: b.ledgerItem } : {}),
      ...(b.purchasePrice !== undefined ? { purchasePrice: Number(b.purchasePrice), priceFrom: b.priceFrom } : {}),
    });
    return NextResponse.json({ ok: true, updated: n });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存に失敗" }, { status: 500 });
  }
}
