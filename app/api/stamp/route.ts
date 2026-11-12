import { NextRequest, NextResponse } from "next/server";
import { deleteCard, getCards } from "@/lib/stampcard";

export const runtime = "nodejs";

// スタンプカードの一覧（お店の人だけ）。LINEのIDは出さない
export async function GET() {
  try {
    const cards = Object.values(await getCards())
      .map((c) => ({
        id: c.id,
        name: c.name,
        stamps: c.stamps,
        totalStamps: c.totalStamps,
        completed: c.completed,
        tickets: c.tickets.filter((t) => !t.usedAt).length,
        createdAt: c.createdAt,
        lastAt: c.lastAt ?? null,
      }))
      .sort((a, b) => (b.lastAt ?? b.createdAt).localeCompare(a.lastAt ?? a.createdAt));
    return NextResponse.json({ cards });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "取得に失敗" }, { status: 500 });
  }
}

// DELETE { id } → カードを消す（お店の人だけ。試しに作ったカードを消すときなど）
export async function DELETE(req: NextRequest) {
  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 });
    const ok = await deleteCard(id);
    if (!ok) return NextResponse.json({ error: "カードが見つかりません" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "消せませんでした" }, { status: 500 });
  }
}
