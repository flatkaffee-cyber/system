import { NextRequest, NextResponse } from "next/server";
import { getBillImage } from "@/lib/bills";

export const runtime = "nodejs";
export const maxDuration = 30;

// 登録した請求書の原本画像（dataURL）を返す
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
  const image = await getBillImage(id);
  if (!image) return NextResponse.json({ error: "画像がありません" }, { status: 404 });
  return NextResponse.json({ image });
}
