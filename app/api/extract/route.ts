import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ReceiptSchema } from "@/lib/receipt";

export const runtime = "nodejs";
export const maxDuration = 60;

// data URL (data:image/png;base64,xxxx) を media_type と base64 に分解
function parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const mediaType = m[1] === "image/jpg" ? "image/jpeg" : m[1];
  return { mediaType, data: m[2] };
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が未設定です。.env.local に設定してください。" },
      { status: 500 },
    );
  }

  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
  }

  const parsed = body.image ? parseDataUrl(body.image) : null;
  if (!parsed) {
    return NextResponse.json(
      { error: "画像がありません（png/jpeg/webp のみ対応）。" },
      { status: 400 },
    );
  }

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      output_format: betaZodOutputFormat(ReceiptSchema),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: parsed.mediaType as
                  | "image/png"
                  | "image/jpeg"
                  | "image/webp"
                  | "image/gif",
                data: parsed.data,
              },
            },
            {
              type: "text",
              text:
                "これは日本のカフェ（合同会社flat.）の経費の領収書・レシートです。" +
                "日付・店名・税込合計金額を読み取り、最も近い会計科目を1つ選んでください。" +
                "金額は税込の合計を円で。複数候補があるときは最も確からしいものを選びます。",
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "この画像は処理できませんでした。" },
        { status: 422 },
      );
    }

    const receipt = response.parsed_output;
    if (!receipt) {
      return NextResponse.json(
        { error: "領収書を読み取れませんでした。別の画像でお試しください。" },
        { status: 422 },
      );
    }

    return NextResponse.json({ receipt });
  } catch (err) {
    console.error("extract error", err);
    const msg = err instanceof Error ? err.message : "抽出に失敗しました。";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
