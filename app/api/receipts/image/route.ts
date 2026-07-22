import { NextRequest, NextResponse } from "next/server";
import { getReceiptImage } from "@/lib/receipts";

export const runtime = "nodejs";
export const maxDuration = 30;

// 保存済み領収書の原本画像（dataURL）を返す。KVの receipt:file:{id} を読むだけ。
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
  const image = await getReceiptImage(id);
  if (!image) return NextResponse.json({ error: "画像がありません" }, { status: 404 });
  return NextResponse.json({ image });
}
