import { NextRequest, NextResponse } from "next/server";
import {
  cardForLine,
  chooseGoal,
  publicCard,
  redeemCode,
  useTicket,
  verifyLineAccessToken,
} from "@/lib/stampcard";

export const runtime = "nodejs";

// お客さんのスタンプカード（LINEの中の /e/stamp から呼ぶ。合言葉なしで通す: middleware）。
// 本人かどうかは、LINEのアクセストークンをLINEに聞いて確かめる。
//
// POST { accessToken }                          … 自分のカードを見る（無ければ作る）
// POST { accessToken, code }                    … 会計のQRを読んだ → スタンプが付く
// POST { accessToken, use: ticketId }           … チケットを使う
// POST { accessToken, choose: ticketId, choice } … 30個のごほうびを選ぶ（tshirt / drink5）
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      accessToken?: string;
      code?: string;
      use?: string;
      choose?: string;
      choice?: "tshirt" | "drink5";
    };
    if (!b.accessToken) return NextResponse.json({ error: "LINEから開いてください" }, { status: 401 });
    const me = await verifyLineAccessToken(b.accessToken);
    let card = await cardForLine(me.sub, me.name);
    let added = 0;
    if (b.code) {
      const r = await redeemCode(card, String(b.code).trim());
      if ("error" in r) return NextResponse.json({ error: r.error, card: publicCard(card) }, { status: 400 });
      card = r.card;
      added = r.added;
    }
    if (b.use) card = await useTicket(card, b.use);
    if (b.choose) {
      if (b.choice !== "tshirt" && b.choice !== "drink5") {
        return NextResponse.json({ error: "Tシャツかドリンクチケットを選んでください" }, { status: 400 });
      }
      card = await chooseGoal(card, b.choose, b.choice);
    }
    return NextResponse.json({ ok: true, added, card: publicCard(card) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
