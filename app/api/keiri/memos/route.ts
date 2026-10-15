import { NextRequest, NextResponse } from "next/server";
import { isMonth } from "@/lib/keiri/period";
import { addMemo, memosForMonth, removeMemo, setMemoDone, type KeiriMemo } from "@/lib/keiri/notes";
import { getMemos, saveMemos } from "@/lib/keiri/store";

export const runtime = "nodejs";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** 一覧を変えて保存し、その月に出すメモを返す。変え方の誤り（空のメモなど）は 400、保存の失敗は 500 */
async function update(month: string, change: (memos: KeiriMemo[]) => KeiriMemo[]) {
  let next: KeiriMemo[];
  try {
    next = change(await getMemos());
  } catch (e) {
    return fail(message(e, "変更できませんでした"), 400);
  }
  try {
    await saveMemos(next);
  } catch (e) {
    return fail(message(e, "保存に失敗しました"), 500);
  }
  return NextResponse.json({ memos: memosForMonth(next, month) });
}

// GET /api/keiri/memos?month=2026-10 → { memos }（その月に出す経理メモ）
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!isMonth(month)) return fail("月の指定が正しくありません", 400);
  try {
    return NextResponse.json({ memos: memosForMonth(await getMemos(), month) });
  } catch (e) {
    return fail(message(e, "読み込みに失敗しました"), 500);
  }
}

// POST /api/keiri/memos { month, text }
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const month = typeof body?.month === "string" ? body.month : "";
  const text = typeof body?.text === "string" ? body.text : "";
  if (!isMonth(month)) return fail("月の指定が正しくありません", 400);
  const id = `km_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return update(month, (memos) => addMemo(memos, { month, text }, id, new Date().toISOString()));
}

// PATCH /api/keiri/memos { month, id, done } → 済みにする／戻す
export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const month = typeof body?.month === "string" ? body.month : "";
  const id = typeof body?.id === "string" ? body.id : "";
  if (!isMonth(month)) return fail("月の指定が正しくありません", 400);
  if (typeof body?.done !== "boolean") return fail("済みかどうかの指定が正しくありません", 400);
  const done = body.done;
  return update(month, (memos) => setMemoDone(memos, id, done, new Date().toISOString()));
}

// DELETE /api/keiri/memos?month=2026-10&id=km_...
export async function DELETE(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? "";
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!isMonth(month)) return fail("月の指定が正しくありません", 400);
  return update(month, (memos) => removeMemo(memos, id));
}
