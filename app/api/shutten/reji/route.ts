import { NextRequest, NextResponse } from "next/server";
import { getEvents } from "@/lib/shutten";
import { getSales, addSale, setVoid, type SaleLine } from "@/lib/shuttenReji";

export const runtime = "nodejs";

// GET /api/shutten/reji?id=xxx → イベント一覧と、そのイベントの会計
// id が無ければ今日以降でいちばん近いイベント
export async function GET(req: NextRequest) {
  try {
    const events = await getEvents();
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const id =
      req.nextUrl.searchParams.get("id") ||
      events.find((e) => e.date >= today)?.id ||
      events[events.length - 1]?.id ||
      "";
    const sales = id ? await getSales(id) : [];
    return NextResponse.json({ events, id, sales });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "取得に失敗" }, { status: 500 });
  }
}

// POST { action: "sale", id, lines, pay, received } / { action: "void", id, saleId, voided }
export async function POST(req: NextRequest) {
  let b: {
    action?: string; id?: string; lines?: SaleLine[]; pay?: string;
    received?: number; saleId?: string; voided?: boolean;
  };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!b.id) return NextResponse.json({ error: "イベントが選ばれていません" }, { status: 400 });
  try {
    if (b.action === "sale") {
      const lines = (b.lines ?? []).filter(
        (l) => l.name && Number.isFinite(l.price) && l.qty > 0,
      );
      if (!lines.length) return NextResponse.json({ error: "商品がありません" }, { status: 400 });
      const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
      const sale = await addSale(b.id, {
        lines,
        total,
        pay: b.pay === "card" ? "card" : "cash",
        received: b.pay === "card" ? undefined : b.received,
      });
      return NextResponse.json({ ok: true, sale });
    }
    if (b.action === "void" && b.saleId) {
      await setVoid(b.id, b.saleId, b.voided !== false);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "不明な操作です" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存に失敗" }, { status: 500 });
  }
}
