import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// カード決済でSquare POSへ渡した注文を、戻ってくるまで覚えておく場所。
//
// これまでは端末のsessionStorageに入れていた。ところが
//   ホーム画面に追加したアプリ → Square POS → 戻り先はSafari
// と別の入れ物に着地するため、Safari側には注文IDが無く、
// 「決済したのに会計が閉じない」状態になっていた。
// どこに戻ってきても拾えるよう、サーバー側に置く。

const KEY = "square:cardPending";
/** 置きっぱなしを拾わないよう、少し経ったら無効にする */
const TTL_MS = 30 * 60 * 1000;

type Pending = { orderId: string; at: number };

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

// GET → いま決済に出している注文（無ければ null）
export async function GET() {
  const store = await kv();
  if (!store) return NextResponse.json({ orderId: null });
  const p = await store.get<Pending>(KEY);
  if (!p || Date.now() - p.at > TTL_MS) return NextResponse.json({ orderId: null });
  return NextResponse.json({ orderId: p.orderId });
}

// POST { order_id } → 決済に出したことを覚える
export async function POST(req: NextRequest) {
  const { order_id } = (await req.json().catch(() => ({}))) as { order_id?: string };
  if (!order_id) return NextResponse.json({ error: "order_id が必要です" }, { status: 400 });
  const store = await kv();
  if (!store) return NextResponse.json({ error: "KV未設定" }, { status: 500 });
  await store.set(KEY, { orderId: order_id, at: Date.now() } satisfies Pending);
  return NextResponse.json({ ok: true });
}

// DELETE → 済んだので忘れる
export async function DELETE() {
  const store = await kv();
  if (store) await store.del(KEY);
  return NextResponse.json({ ok: true });
}
