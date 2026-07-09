import { NextResponse } from "next/server";
import { isGoogleConnected, sheetsGet, sheetsUpdate } from "@/lib/google";
import { KINTAI_SHEET_ID, computeFColumn } from "@/lib/labor";

export const runtime = "nodejs";
export const maxDuration = 30;

// 勤怠シートの労働時間(F列)を出勤/退勤/休憩から再計算して書き戻す
export async function POST() {
  if (!(await isGoogleConnected())) {
    return NextResponse.json({ error: "Google未接続です" }, { status: 400 });
  }
  try {
    const rows = await sheetsGet(KINTAI_SHEET_ID, "勤怠!A2:F2000");
    const f = computeFColumn(rows);
    const values = f.map((v) => [v]);
    let filled = 0;
    for (const v of f) if (v !== "") filled++;
    if (values.length > 0) {
      await sheetsUpdate(KINTAI_SHEET_ID, `勤怠!F2:F${1 + values.length}`, values);
    }
    return NextResponse.json({ ok: true, rows: values.length, filled });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "再計算に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
