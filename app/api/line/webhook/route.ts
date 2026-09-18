import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eventCarousel, wantsEventList, greetingMessage } from "@/lib/lineEvents";

export const runtime = "nodejs";

// LINE Messaging API Webhook。
// 友だち追加(follow)に「あいさつメッセージ」を返す。
// OA Managerのあいさつメッセージの代わりにここで管理する（コードで変更できる）。
// 必要な環境変数: LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET

// あいさつの中身は lib/lineEvents.ts の greetingMessage() が組み立てる。
// 店の情報と「いま受付中のイベント」から毎回作るので、書き換え忘れが起きない。

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
};

async function replyMessages(replyToken: string, messages: unknown[]) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
  if (!token) return;
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
}

async function reply(replyToken: string, text: string) {
  await replyMessages(replyToken, [{ type: "text", text }]);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();

  // 署名検証（シークレット設定時のみ）
  const secret = process.env.LINE_CHANNEL_SECRET || "";
  if (secret) {
    const sig = req.headers.get("x-line-signature") || "";
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("base64");
    if (sig !== expected) {
      return NextResponse.json({ error: "bad signature" }, { status: 401 });
    }
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(raw).events as LineEvent[]) ?? [];
  } catch {
    /* 検証ボタンの空リクエスト等 */
  }

  for (const ev of events) {
    if (ev.type === "follow" && ev.replyToken) {
      await reply(ev.replyToken, greetingMessage());
      continue;
    }
    // リッチメニューの「イベント申込」ボタン（message アクション）と、
    // 「イベント」などと打ってくれた人に、受付中のイベント一覧を返す。
    if (
      ev.type === "message" &&
      ev.replyToken &&
      ev.message?.type === "text" &&
      ev.message.text &&
      wantsEventList(ev.message.text)
    ) {
      await replyMessages(ev.replyToken, [eventCarousel()]);
    }
  }

  return NextResponse.json({ ok: true });
}
