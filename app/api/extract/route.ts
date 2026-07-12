import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ReceiptSchema } from "@/lib/receipt";
import { getReceipts } from "@/lib/receipts";
import { getDecisions } from "@/lib/kb";

async function existingTags(): Promise<string[]> {
  const set = new Set<string>();
  try {
    for (const r of await getReceipts()) for (const t of r.tags ?? []) if (t) set.add(t);
    for (const d of Object.values(await getDecisions())) for (const t of d.tags ?? []) if (t) set.add(t);
  } catch {
    /* KV未設定でも継続 */
  }
  return [...set];
}

export const runtime = "nodejs";
export const maxDuration = 60;

// data URL (data:image/png;base64,xxxx / data:application/pdf;base64,xxxx) を分解
function parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif)|application\/pdf);base64,(.+)$/.exec(
    dataUrl,
  );
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
      { error: "ファイルがありません（png/jpeg/webp/PDF に対応）。" },
      { status: 400 },
    );
  }

  const isPdf = parsed.mediaType === "application/pdf";
  const fileBlock = isPdf
    ? {
        type: "document" as const,
        source: { type: "base64" as const, media_type: "application/pdf" as const, data: parsed.data },
      }
    : {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: parsed.mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
          data: parsed.data,
        },
      };

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
            fileBlock,
            {
              type: "text",
              text:
                "これは日本のカフェ（合同会社flat.）の経費の領収書・レシート（またはメール/注文確認PDF）です。" +
                "日付・店名(支払先)・税込合計金額を読み取り、最も近い会計科目を1つ選んでください。" +
                "金額は税込の合計を円で。複数候補があるときは最も確からしいものを選びます。" +
                "\n用途タグ(tags)も付けてください。既存タグ=[" +
                (await existingTags()).join(", ") +
                "]。この中に合うものがあれば必ずそれを使う(表記統一)。無ければ簡潔な新タグ。",
            },
          ],
        },
      ] as unknown as Anthropic.Beta.BetaMessageParam[],
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
