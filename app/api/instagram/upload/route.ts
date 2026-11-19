import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const runtime = "nodejs";

// ストーリーの動画を、画面からBlobへ直接上げるための鍵を出す。
// 関数を通すと4.5MBで止まるので、動画の中身はここを通らない。
// 置き場所は ig/vid/<32桁>.mp4 だけ。上げ終わったら画面が /api/instagram の addVideo で一覧に足す。
// インスタの決まり：MP4かMOV、60秒まで、100MBまで。
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as HandleUploadBody;
    const r = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!/^ig\/vid\/[0-9a-f]{32}\.mp4$/.test(pathname)) throw new Error("置き場所が正しくありません");
        return {
          allowedContentTypes: ["video/mp4", "video/quicktime"],
          maximumSizeInBytes: 100 * 1024 * 1024,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
    });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
