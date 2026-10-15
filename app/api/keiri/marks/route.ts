import { NextRequest, NextResponse } from "next/server";
import { isMonth } from "@/lib/keiri/period";
import { putMark } from "@/lib/keiri/notes";
import { getMarks, saveMarks } from "@/lib/keiri/store";

export const runtime = "nodejs";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// GET /api/keiri/marks?month=2026-10 → { marks }（行の key → 色とメモ）
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!isMonth(month)) return fail("月の指定が正しくありません", 400);
  try {
    return NextResponse.json({ marks: await getMarks(month) });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "読み込みに失敗しました", 500);
  }
}

// PUT /api/keiri/marks { month, key, color?, note? } → { marks }。色もメモも空なら、その行の印を消す
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const month = typeof body?.month === "string" ? body.month : "";
  const key = typeof body?.key === "string" ? body.key : "";
  if (!isMonth(month)) return fail("月の指定が正しくありません", 400);
  if (!key || key.length > 100) return fail("行の指定が正しくありません", 400);
  try {
    const marks = putMark(
      await getMarks(month),
      key,
      {
        color: typeof body?.color === "string" ? body.color : undefined,
        note: typeof body?.note === "string" ? body.note : undefined,
      },
      new Date().toISOString(),
    );
    await saveMarks(month, marks);
    return NextResponse.json({ marks });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "保存に失敗しました", 500);
  }
}
