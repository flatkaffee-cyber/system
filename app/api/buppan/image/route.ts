import { NextRequest, NextResponse } from "next/server";
import { checkPin } from "@/lib/menuAdmin";
import { attachGoodsImage } from "@/lib/squareGoods";

export const runtime = "nodejs";

// 物販の写真を1枚ずつ Square の商品に付ける。
// Vercel の関数は1回4.5MBまでしか受け取れないので、画面側で縮めてから1枚ずつ送る。
// multipart: pin, itemId, primary("1"|"0"), caption, file

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "写真を受け取れませんでした" }, { status: 400 });
  }
  if (!(await checkPin(String(form.get("pin") ?? "")))) {
    return NextResponse.json({ error: "暗証番号が違います" }, { status: 401 });
  }
  const itemId = String(form.get("itemId") ?? "");
  const file = form.get("file");
  if (!itemId) return NextResponse.json({ error: "itemId が必要です" }, { status: 400 });
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "写真がありません" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "写真が大きすぎます（4MBまで）" }, { status: 413 });
  }
  if (!/^image\/(jpeg|pjpeg|png|gif)$/.test(file.type)) {
    return NextResponse.json({ error: "JPG・PNG・GIF の写真にしてください" }, { status: 415 });
  }

  try {
    const name = (file as File).name || "photo.jpg";
    const r = await attachGoodsImage(
      itemId,
      file,
      name,
      String(form.get("caption") ?? ""),
      form.get("primary") === "1",
    );
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "写真の登録に失敗" },
      { status: 500 },
    );
  }
}
