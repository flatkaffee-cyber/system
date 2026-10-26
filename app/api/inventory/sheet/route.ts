import { NextRequest, NextResponse } from "next/server";
import { deleteShiire, isDbReady, listShiire, parsePrice, saveShiire } from "@/lib/shiireList";

export const runtime = "nodejs";
export const maxDuration = 60;

// 仕入れ表。2026-10-26 から Supabase（shiire_items）に持つ。Google の連携は要らない。
// GET                     → 見出しごとの品目
// POST { item }           → 足す（id なし）・直す（id あり）
// DELETE ?id=             → 消す
export async function GET() {
  if (!isDbReady()) return NextResponse.json({ error: "Supabase未設定" }, { status: 500 });
  try {
    const sections = await listShiire();
    const total = sections.reduce((n, s) => n + s.rows.length, 0);
    // 価格が入っていないものは発注前に調べる必要があるので数えておく
    const missingPrice = sections.reduce((n, s) => n + s.rows.filter((r) => r.price === null).length, 0);
    return NextResponse.json({ sections, total, missingPrice });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "読み取りに失敗" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { item } = (await req.json()) as {
      item?: {
        id?: number; section?: string; name?: string; supplier?: string; url?: string;
        price?: string | number | null; capacity?: string; note?: string; orderQty?: string; sort?: number;
      };
    };
    if (!item) return NextResponse.json({ error: "item が必要です" }, { status: 400 });
    if (!item.id && (!item.name?.trim() || !item.section?.trim())) {
      return NextResponse.json({ error: "見出しと仕入れ物の名前を入れてください" }, { status: 400 });
    }
    const saved = await saveShiire({
      ...item,
      ...(item.price !== undefined ? { price: parsePrice(item.price) } : {}),
    } as Parameters<typeof saveShiire>[0]);
    return NextResponse.json({ ok: true, item: saved });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存に失敗" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 });
    await deleteShiire(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "削除に失敗" }, { status: 500 });
  }
}
