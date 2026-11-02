import { NextRequest } from "next/server";
import { readImage } from "@/lib/instagram";

export const runtime = "nodejs";

// ストーリーの画像。インスタのサーバーが取りに来るので合言葉なしで開ける（middleware で通している）。
// IDは推測できない32桁なので、一覧からたどられることはない。
export async function GET(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const id = (await params).file.replace(/\.jpg$/, "");
  const buf = await readImage(id);
  if (!buf) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" },
  });
}
