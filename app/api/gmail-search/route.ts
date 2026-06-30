import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { gmailSearch, isGoogleConnected, type Mail } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 60;

const QuerySchema = z.object({
  queries: z
    .array(z.string())
    .describe("Gmail検索用キーワード（日本語、2〜4個）。スペース区切りでAND。"),
});

// 明細(カナ摘要+金額)からGmail検索キーワードをAIで生成
async function genQueries(amount: number, description: string): Promise<string[]> {
  try {
    const client = new Anthropic();
    const res = await client.beta.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 400,
      output_format: betaZodOutputFormat(QuerySchema),
      system:
        "銀行振込の明細(摘要はカナで読みにくい)と金額から、Gmailで関連メール(請求/案内/やり取り)を探す検索キーワードを2〜4個作る。" +
        "カナを漢字や一般的な語に直し、取引の用途も推測する。例:『ビワコサンシドウジハナビタイカイ』→['花火大会 出店','ナイトマーケット 出店料','琵琶湖 花火']。" +
        "各要素はGmailのqに入れる文字列(スペース区切りでAND検索)。固有名詞＋用途語を混ぜる。",
      messages: [
        {
          role: "user",
          content: `振込明細: 摘要「${description}」 金額 ${amount}円。Gmail検索キーワードを作って。`,
        },
      ],
    });
    return res.parsed_output?.queries ?? [];
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  if (!(await isGoogleConnected())) {
    return NextResponse.json({ connected: false, mails: [] });
  }
  let body: { amount?: number; description?: string; keyword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const amount = body.amount ?? 0;
  const description = body.description ?? "";
  const keyword = (body.keyword ?? "").trim();

  // 検索クエリ群を用意：①ユーザー指定 or AI生成キーワード ②金額(カンマ無し)
  let queries: string[] = [];
  if (keyword) queries.push(keyword);
  else queries = await genQueries(amount, description);
  if (amount) queries.push(`${amount}`); // 例: 50000

  try {
    const seen = new Set<string>();
    const mails: Mail[] = [];
    for (const q of queries) {
      if (mails.length >= 4) break;
      const found = await gmailSearch(q, 3);
      for (const m of found) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          mails.push(m);
        }
      }
    }
    return NextResponse.json({ connected: true, queries, mails });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "エラー";
    return NextResponse.json({ connected: true, error: msg, mails: [] });
  }
}
