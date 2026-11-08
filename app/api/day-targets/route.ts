import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/seiseki";
import { sumTargets } from "@/lib/keiri/dayTargets";

export const runtime = "nodejs";

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

// GET /api/day-targets?from=2026-11-09&to=2026-11-09
//   売上の画面に出す、その日（期間）の売上目標。目標は今月の成績の設定（dayTargets）に入っている
export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to") ?? from;
  if (!isDate(from) || !isDate(to)) {
    return NextResponse.json({ error: "from と to を YYYY-MM-DD で指定してください" }, { status: 400 });
  }
  try {
    const { dayTargets } = await getSettings();
    const days = Object.fromEntries(Object.entries(dayTargets ?? {}).filter(([d]) => d >= from && d <= to));
    return NextResponse.json({ from, to, days, sum: sumTargets(dayTargets ?? {}, from, to) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "取得に失敗" }, { status: 500 });
  }
}
