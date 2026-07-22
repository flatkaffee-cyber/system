import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ReceiptLineSchema } from "@/lib/receipt";
import { getReceipt, getReceiptImage, getReceipts } from "@/lib/receipts";
import { getDecisions } from "@/lib/kb";

export const runtime = "nodejs";
export const maxDuration = 60;

const GuessSchema = z.object({
  lines: z
    .array(ReceiptLineSchema)
    .describe("内訳。用途/科目が違う品目は行を分ける。各行の金額合計＝total。"),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("推測の自信度。画像から明確に読めた=high、店名/金額からの推測=low。"),
});

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

function parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif)|application\/pdf);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mediaType: m[1] === "image/jpg" ? "image/jpeg" : m[1], data: m[2] };
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 500 });
  }
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const id = body.id;
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });

  const receipt = await getReceipt(id);
  if (!receipt) return NextResponse.json({ error: "領収書が見つかりません" }, { status: 404 });

  const image = await getReceiptImage(id);
  const parsed = image ? parseDataUrl(image) : null;

  const tags = (await existingTags()).join(", ");
  const known =
    `既知の情報：日付=${receipt.date || "不明"} / 店名=${receipt.vendor || "不明"} / ` +
    `税込合計=${receipt.total}円 / 現在の科目=${receipt.category || "不明"}` +
    (receipt.memo ? ` / メモ=${receipt.memo}` : "");

  // ユーザー向け（メッセージ本文）
  type Block =
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
    | { type: "document"; source: { type: "base64"; media_type: string; data: string } };

  const content: Block[] = [];
  let instruction: string;

  if (parsed) {
    // 原本画像あり → Visionで正確に読む
    if (parsed.mediaType === "application/pdf") {
      content.push({ type: "document", source: { type: "base64", media_type: parsed.mediaType, data: parsed.data } });
    } else {
      content.push({ type: "image", source: { type: "base64", media_type: parsed.mediaType, data: parsed.data } });
    }
    instruction =
      "これは合同会社flat.（カフェ）の経費の領収書/レシート/注文確認です。原本画像から**何を買ったか（品目）**を読み取り、内訳(lines)に分けてください。" +
      "用途や科目が違う品目は行を分け、各行に 品目名・税込金額・科目・用途タグ を付ける。金額合計は " +
      `${receipt.total}円 に一致させる。読み取れた分はhigh、推測が混じる分はmedium/lowで。`;
  } else {
    // 画像なし → 店名・金額からの推測（confidenceは低め）
    instruction =
      "以下の領収書は原本画像が残っていません。**店名・合計金額・科目から、何を買ったかを推測**して内訳(lines)を作ってください。" +
      "確証はないので confidence は low を基本に。品目名は「（推測）〇〇」のように推測と分かる表現にし、金額合計は " +
      `${receipt.total}円 に一致させる（内訳が割れなければ1行に全額）。`;
  }

  content.push({
    type: "text",
    text:
      `${instruction}\n${known}\n用途タグは既存タグ=[${tags}]に合うものがあれば必ずそれを使う（表記統一）。無ければ簡潔な新タグ。`,
  });

  try {
    const client = new Anthropic();
    const res = await client.beta.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      output_format: betaZodOutputFormat(GuessSchema),
      messages: [{ role: "user", content }] as unknown as Anthropic.Beta.BetaMessageParam[],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) {
      return NextResponse.json({ error: "推測できませんでした" }, { status: 422 });
    }
    return NextResponse.json({
      lines: res.parsed_output.lines,
      confidence: res.parsed_output.confidence,
      source: parsed ? "image" : "text",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "エラー";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
