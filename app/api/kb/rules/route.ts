import { NextRequest, NextResponse } from "next/server";
import { getRules, addRule, deleteRule } from "@/lib/kb";

export const runtime = "nodejs";

// GET → 現在の会計ルール・ノウハウ一覧
export async function GET() {
  return NextResponse.json({ rules: await getRules() });
}

// POST { text, source? } → ノウハウを1件追加（社内AI育成）
export async function POST(req: NextRequest) {
  let body: { text?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!body.text || !body.text.trim()) {
    return NextResponse.json({ error: "textが必要です" }, { status: 400 });
  }
  await addRule(body.text, body.source || "手動");
  return NextResponse.json({ ok: true });
}

// DELETE ?id=xxx → ノウハウを削除
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
  await deleteRule(id);
  return NextResponse.json({ ok: true });
}
