import { NextRequest, NextResponse } from "next/server";
import { issueCode, stampsFor, YEN_PER_STAMP } from "@/lib/stampcard";

export const runtime = "nodejs";

// 会計のときに出すスタンプのQR（お店の人だけ。合言葉が要る）。
// POST { amount, run?, orderId? } → { code, stamps, url }
//   同じ注文（orderId）には同じQRを返すので、二度押しても二重には付かない
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as { amount?: number; run?: boolean; orderId?: string };
    const amount = Math.round(Number(b.amount) || 0);
    if (stampsFor(amount, !!b.run) <= 0) {
      return NextResponse.json({ error: `¥${YEN_PER_STAMP}より少ない会計には、ランニングの日でないとスタンプが付きません` }, { status: 400 });
    }
    const { code, stamps } = await issueCode(amount, !!b.run, b.orderId ? String(b.orderId) : undefined);
    const liffId =
      process.env.NEXT_PUBLIC_LIFF_ID_EVENT ||
      process.env.NEXT_PUBLIC_LIFF_ID_DJNIGHT ||
      process.env.NEXT_PUBLIC_LIFF_ID_NATSUMATSURI ||
      "";
    // LINEのカメラやスマホのカメラで読むと、LINEの中でカードが開いてスタンプが付く
    const url = liffId
      ? `https://liff.line.me/${liffId}/stamp?c=${code}`
      : `${req.nextUrl.origin}/e/stamp?c=${code}`;
    return NextResponse.json({ ok: true, code, stamps, url, preview: stampsFor(amount, !!b.run) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
