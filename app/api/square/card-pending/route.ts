import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// カード決済でSquare POSへ渡した注文を、戻ってくるまで覚えておく場所。
//
// これまでは端末のsessionStorageに入れていた。ところが
//   ホーム画面に追加したアプリ → Square POS → 戻り先はSafari
// と別の入れ物に着地するため、Safari側には注文IDが無く、
// 「決済したのに会計が閉じない」状態になっていた。
// どこに戻ってきても拾えるよう、サーバー側に置く。
//
// 以前は1枠しか無く、2台の端末が続けてカード決済に出ると後の注文が前の注文を
// 上書きしていた。戻ってきた側が別の注文を「支払い済み」として閉じてしまい、
// 本当に払った注文が開いたまま残る。注文ごとに覚える。

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

async function load(): Promise<Pending[]> {
  const store = await kv();
  if (!store) return [];
  const raw = await store.get<Pending[] | Pending>(KEY);
  // 旧形式（1件のオブジェクト）が残っていても読めるようにする
  const list: Pending[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const now = Date.now();
  return list.filter((p) => p.orderId && now - p.at < TTL_MS);
}

// GET → 決済に出している注文。
//   orderId … ちょうど1件のときだけ入る。複数あるときは null（当てずっぽうで閉じないため）
//   pending … 全件
export async function GET() {
  const list = await load();
  return NextResponse.json({
    orderId: list.length === 1 ? list[0].orderId : null,
    pending: list.map((p) => p.orderId),
  });
}

// POST { order_id } → 決済に出したことを覚える
export async function POST(req: NextRequest) {
  const { order_id } = (await req.json().catch(() => ({}))) as { order_id?: string };
  if (!order_id) return NextResponse.json({ error: "order_id が必要です" }, { status: 400 });
  const store = await kv();
  if (!store) return NextResponse.json({ error: "KV未設定" }, { status: 500 });
  const cur = (await load()).filter((p) => p.orderId !== order_id);
  await store.set(KEY, [...cur, { orderId: order_id, at: Date.now() }]);
  return NextResponse.json({ ok: true });
}

// DELETE ?order_id=xxx → その注文だけ忘れる。指定なしなら全部忘れる
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("order_id");
  const store = await kv();
  if (!store) return NextResponse.json({ ok: true });
  if (!id) {
    await store.del(KEY);
  } else {
    const rest = (await load()).filter((p) => p.orderId !== id);
    if (rest.length) await store.set(KEY, rest);
    else await store.del(KEY);
  }
  return NextResponse.json({ ok: true });
}
