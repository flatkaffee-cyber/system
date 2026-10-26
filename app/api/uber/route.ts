import { NextRequest, NextResponse } from "next/server";
import {
  fromOrderDetails,
  getUberOrders,
  hotsandCount,
  isCompleted,
  saveUberOrders,
  type UberOrder,
} from "@/lib/uber";

export const runtime = "nodejs";

const WD = ["日", "月", "火", "水", "木", "金", "土"];
const mondayOf = (d: string) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};

// GET /api/uber?from=YYYY-MM-DD&to=YYYY-MM-DD
//   取り込んだUber Eatsの注文と、週ごとの売上・商品ごとの数・曜日ごとのホットサンドの数
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const from = sp.get("from") || "2000-01-01";
    const to = sp.get("to") || "2999-12-31";
    const orders = Object.values(await getUberOrders())
      .filter((o) => o.date >= from && o.date <= to)
      .sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
    const done = orders.filter(isCompleted);

    const byWeek: Record<string, { count: number; subtotal: number; net: number }> = {};
    const byItem: Record<string, number> = {};
    const hotsand = WD.map((w) => ({ weekday: w, classic: 0, garden: 0, orders: 0 }));
    for (const o of done) {
      const w = (byWeek[mondayOf(o.date)] ??= { count: 0, subtotal: 0, net: 0 });
      w.count++;
      w.subtotal += o.subtotal;
      w.net += o.net;
      for (const it of o.items) byItem[it.name] = (byItem[it.name] ?? 0) + it.qty;
      const h = hotsandCount(o);
      const d = hotsand[new Date(`${o.date}T00:00:00Z`).getUTCDay()];
      d.classic += h.classic;
      d.garden += h.garden;
      d.orders++;
    }
    const weeks = Object.keys(byWeek).length || 1;
    return NextResponse.json({
      from,
      to,
      count: done.length,
      canceled: orders.length - done.length,
      subtotal: done.reduce((n, o) => n + o.subtotal, 0),
      net: done.reduce((n, o) => n + o.net, 0),
      lastImportedOrder: orders[0]?.requestedAt ?? null,
      byWeek: Object.entries(byWeek)
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .map(([monday, v]) => ({ monday, ...v })),
      byItem: Object.entries(byItem)
        .sort(([, a], [, b]) => b - a)
        .map(([name, qty]) => ({ name, qty })),
      // 週あたりの平均（取り込んだ週数で割る）
      hotsandPerWeek: hotsand.map((h) => ({
        ...h,
        classic: Math.round((h.classic / weeks) * 10) / 10,
        garden: Math.round((h.garden / weeks) * 10) / 10,
      })),
      weeks,
      orders,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/uber
//   { orders: UberOrder[] }                                  … 整えた形で取り込む
//   { raw: [{ uuid, status, details }] }                     … Uber Eats Manager の OrderDetails をそのまま取り込む
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      orders?: UberOrder[];
      raw?: { uuid: string; status: string; details: Parameters<typeof fromOrderDetails>[0] }[];
    };
    const orders = [
      ...(b.orders ?? []),
      ...(b.raw ?? []).filter((r) => r.details).map((r) => fromOrderDetails(r.details, r.uuid, r.status)),
    ];
    if (!orders.length) return NextResponse.json({ error: "注文がありません" }, { status: 400 });
    const res = await saveUberOrders(orders);
    return NextResponse.json({ ok: true, received: orders.length, ...res });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}
