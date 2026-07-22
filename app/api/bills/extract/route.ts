import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CATEGORIES } from "@/lib/receipt";
import { BILL_METHODS } from "@/lib/bills";

export const runtime = "nodejs";
export const maxDuration = 60;

const InvoiceSchema = z.object({
  payee: z.string().describe("請求元＝支払先の名称（例: ○○少額短期保険、△△パーキング）。読めなければ空。"),
  amount: z.number().describe("今回の請求金額（税込・円）。数字のみ。読めなければ0。"),
  category: z
    .enum(CATEGORIES)
    .describe("科目。保険→保険料、駐車場や家賃→家賃、電気ガス水道→水道光熱費、ネット/電話→通信費。判断できなければ不明。"),
  dueDate: z.string().describe("支払期限・振込期日。YYYY-MM-DD。読めなければ空文字。"),
  billingMonth: z.string().describe("請求の対象月。YYYY-MM。読めなければ空文字。"),
  method: z
    .enum(BILL_METHODS as [string, ...string[]])
    .describe("支払方法の手がかり。コンビニ払込票=コンビニ、口座振替の記載=口座振替、振込先口座の記載=振込、記載なし=その他。"),
  recurring: z.boolean().describe("毎月同額で継続しそうな定期請求なら true（保険・家賃・駐車場・通信など）。"),
  confidence: z.enum(["high", "medium", "low"]).describe("抽出の自信度。不鮮明なら low。"),
});

function parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif)|application\/pdf);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mediaType: m[1] === "image/jpg" ? "image/jpeg" : m[1], data: m[2] };
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 500 });
  }
  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const parsed = body.image ? parseDataUrl(body.image) : null;
  if (!parsed) {
    return NextResponse.json({ error: "ファイルがありません（png/jpeg/webp/PDF対応）" }, { status: 400 });
  }
  const isPdf = parsed.mediaType === "application/pdf";
  const fileBlock = isPdf
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: parsed.data } }
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
    const res = await client.beta.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      output_format: betaZodOutputFormat(InvoiceSchema),
      messages: [
        {
          role: "user",
          content: [
            fileBlock,
            {
              type: "text",
              text:
                "これは合同会社flat.（カフェ）宛の請求書・払込票・注文確認です。" +
                "毎月払う固定費として登録するため、支払先(payee)・今回の請求金額(amount,税込)・科目(category)・支払期限(dueDate)・対象月(billingMonth)・支払方法(method)・定期かどうか(recurring)を読み取ってください。" +
                "コンビニ払込票なら method=コンビニ。口座振替のお知らせなら method=口座振替。振込先が書いてあれば method=振込。",
            },
          ],
        },
      ] as unknown as Anthropic.Beta.BetaMessageParam[],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) {
      return NextResponse.json({ error: "この画像は読み取れませんでした" }, { status: 422 });
    }
    return NextResponse.json({ invoice: res.parsed_output });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "抽出に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
