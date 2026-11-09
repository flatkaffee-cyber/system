import { NextRequest, NextResponse } from "next/server";
import { getNippo, saveNippo, NIPPO_FIELDS, type Nippo } from "@/lib/nippo";
import { STAFF } from "@/lib/shift";

export const runtime = "nodejs";

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// GET /api/nippo?date=YYYY-MM-DD → その日の日報（名前 → 日報）
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!isDate(date)) return NextResponse.json({ error: "date を YYYY-MM-DD で指定してください" }, { status: 400 });
  try {
    return NextResponse.json({ date, reports: await getNippo(date) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "取得に失敗" }, { status: 500 });
  }
}

// POST { date, name, asOf?, draft?, sales?, guests?, trouble?, other? }
//   draft=true … 書いている途中の自動保存（空でもよい）。draft=false（または無し）… 提出
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as Partial<Nippo> & { date?: string };
    if (!isDate(b.date)) return NextResponse.json({ error: "日付が読めません" }, { status: 400 });
    const name = (b.name ?? "").trim();
    // シフトに入る人の名前だけ受け付ける（打ち間違いで別の人の日報ができないように）
    if (!(STAFF as readonly string[]).includes(name)) {
      return NextResponse.json({ error: "名前を選んでください" }, { status: 400 });
    }
    const draft = b.draft === true;
    const n: Nippo = { name, at: new Date().toISOString(), draft };
    const asOf = String(b.asOf ?? "").trim();
    if (/^\d{1,2}:\d{2}$/.test(asOf)) n.asOf = asOf;
    for (const f of NIPPO_FIELDS) {
      const v = String(b[f.key] ?? "").trim().slice(0, 3000);
      if (v) n[f.key] = v;
    }
    if (!draft && !NIPPO_FIELDS.some((f) => n[f.key])) {
      return NextResponse.json({ error: "どれか1つは書いてください" }, { status: 400 });
    }
    // 提出したあとの日報を、開きっぱなしの別の画面の下書きで戻さない
    const cur = (await getNippo(b.date))[name];
    if (draft && cur && cur.draft === false) {
      return NextResponse.json({ ok: true, skipped: "提出済み", reports: await getNippo(b.date) });
    }
    return NextResponse.json({ ok: true, reports: await saveNippo(b.date, n) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存に失敗" }, { status: 500 });
  }
}
