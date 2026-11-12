import { NextResponse } from "next/server";
import { getCards } from "@/lib/stampcard";

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
