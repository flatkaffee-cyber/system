import { NextRequest, NextResponse } from "next/server";
import { isAmountOnly, pairPosOrders, type SqOrder } from "@/lib/posMatch";
import { getFixes, saveFix } from "@/lib/salesFix";

export const runtime = "nodejs";
export const maxDuration = 60;

// レジで金額だけ打たれた過去の注文（売上の商品別で「金額入力（店内）」）に、あとから品目を入れる。
// 「残った注文を片付ける」が品目を写していなかった分（2026-10-26 に直した）の埋め直し用。
//   GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD … つなげる組と、つなげなかった注文を見るだけ
//   POST { from, to }                    … つないだ品目を対応表（lib/salesFix）に入れる。入っているものは上書きしない

const SQUARE_API = "https://connect.squareup.com/v2";
const hdrs = () => ({
  "Square-Version": "2024-11-20",
  Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN || ""}`,
  "Content-Type": "application/json",
});

async function fetchOrders(from: string, to: string): Promise<SqOrder[]> {
  const loc = (await (await fetch(`${SQUARE_API}/locations`, { headers: hdrs() })).json()).locations?.[0]?.id;
  const out: SqOrder[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(`${SQUARE_API}/orders/search`, {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify({
        location_ids: [loc],
        cursor,
        limit: 500,
        query: {
          filter: {
            state_filter: { states: ["COMPLETED", "CANCELED"] },
            date_time_filter: {
              created_at: {
                start_at: new Date(`${from}T00:00:00+09:00`).toISOString(),
                end_at: new Date(`${to}T23:59:59+09:00`).toISOString(),
              },
            },
          },
          sort: { sort_field: "CREATED_AT", sort_order: "ASC" },
        },
      }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.errors?.[0]?.detail || `Square ${res.status}`);
    out.push(...(d.orders || []));
    cursor = d.cursor;
  } while (cursor);
  return out;
}

async function plan(from: string, to: string) {
  const [orders, fixes] = await Promise.all([fetchOrders(from, to), getFixes()]);
  const pos = orders.filter((o) => o.state === "COMPLETED" && o.tenders?.length && isAmountOnly(o) && !fixes[o.id]);
  const sys = orders.filter((o) => o.state === "CANCELED" && !isAmountOnly(o));
  const pairs = pairPosOrders(sys, pos);
  const paired = new Set(pairs.map((p) => p.posId));
  const jst = (iso: string) => new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
  const byId = new Map(orders.map((o) => [o.id, o]));
  return {
    pairs: pairs.map((p) => ({
      ...p,
      at: jst(byId.get(p.posId)!.created_at),
      amount: byId.get(p.posId)!.total_money?.amount ?? 0,
    })),
    unmatched: pos
      .filter((o) => !paired.has(o.id))
      .map((o) => ({ id: o.id, at: jst(o.created_at), amount: o.total_money?.amount ?? 0, note: o.line_items?.[0]?.note ?? "" })),
  };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to") || from;
    if (!from || !to) return NextResponse.json({ error: "from と to が必要です" }, { status: 400 });
    return NextResponse.json(await plan(from, to));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "取得に失敗" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { from, to } = (await req.json()) as { from?: string; to?: string };
    if (!from || !to) return NextResponse.json({ error: "from と to が必要です" }, { status: 400 });
    const { pairs, unmatched } = await plan(from, to);
    for (const p of pairs) await saveFix(p.posId, p.items);
    return NextResponse.json({ ok: true, saved: pairs.length, unmatched });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存に失敗" }, { status: 500 });
  }
}
