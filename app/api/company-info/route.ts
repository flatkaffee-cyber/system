import { NextRequest, NextResponse } from "next/server";
import { getCompanyInfo, saveCompanyInfo, GROUPS } from "@/lib/companyInfo";

export const runtime = "nodejs";

// GET: 会社情報（項目の並びと値）
export async function GET() {
  return NextResponse.json({ groups: GROUPS, values: await getCompanyInfo() });
}

// POST: { values: { key: value } } で保存
export async function POST(req: NextRequest) {
  try {
    const { values } = (await req.json()) as { values?: Record<string, string> };
    if (!values) return NextResponse.json({ error: "values が必要" }, { status: 400 });
    await saveCompanyInfo(values);
    return NextResponse.json({ ok: true, values: await getCompanyInfo() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}
