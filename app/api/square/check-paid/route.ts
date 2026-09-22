import { NextRequest, NextResponse } from "next/server";
import { markCardPaid } from "@/lib/cardPaid";

const USED_KEY = "checkpaid:used";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

/** どの決済をどの注文に使ったか。決済ID → 注文ID */
async function getUsed(): Promise<Record<string, string>> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<Record<string, string>>(USED_KEY)) ?? {};
}

async function markUsed(paymentId: string, orderId: string): Promise<void> {
  const store = await kv();
  if (!store) return;
  const used = await getUsed();
  used[paymentId] = orderId;
  await store.set(USED_KEY, used);
}

export const runtime = "nodejs";
export const maxDuration = 60;

const SQUARE_API = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-11-20";

function hdrs() {
  const token = process.env.SQUARE_ACCESS_TOKEN || "";
  return {
    "Square-Version": SQUARE_VERSION,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/** 開いたままの注文を閉じる。売上はSquare側で計上済みなのでCANCELEDにする */
async function closeOrder(
  orderId: string,
  version: number,
): Promise<{ ok: boolean; detail?: string }> {
  const res = await fetch(`${SQUARE_API}/orders/${orderId}`, {
    method: "PUT",
    headers: hdrs(),
    body: JSON.stringify({
      order: { version, state: "CANCELED" },
      idempotency_key: `chk_${orderId.slice(-10)}_${Date.now().toString(36)}`,
    }),
  });
  if (res.ok) {
    await markCardPaid(orderId).catch(() => {});
    return { ok: true };
  }
  const d = await res.json().catch(() => ({}) as any);
  return { ok: false, detail: d.errors?.[0]?.detail };
}

// GET ?from=2026-09-15T17:00&to=2026-09-15T22:00 （JSTで指定）
//   その時間帯のSquareの決済と、すでにどの注文に使ったかを返す。
//   会計漏れを突き合わせるための読み取り専用の窓口。
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    const jst = (v: string) => new Date(`${v}:00+09:00`).toISOString();
    const from = q.get("from") ? jst(q.get("from")!) : new Date(Date.now() - 12 * 3600_000).toISOString();
    const to = q.get("to") ? jst(q.get("to")!) : new Date().toISOString();

    const all: any[] = [];
    let cursor = "";
    for (let page = 0; page < 5; page++) {
      const url =
        `${SQUARE_API}/payments?begin_time=${encodeURIComponent(from)}` +
        `&end_time=${encodeURIComponent(to)}&sort_order=ASC&limit=100` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
      const res = await fetch(url, { headers: hdrs() });
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json(
          { error: data.errors?.[0]?.detail || "支払いを調べられませんでした" },
          { status: res.status },
        );
      }
      all.push(...(data.payments || []));
      cursor = data.cursor || "";
      if (!cursor) break;
    }

    const used = await getUsed();
    return NextResponse.json({
      from,
      to,
      count: all.length,
      used,
      payments: all.map((p: any) => ({
        id: p.id,
        amount: p.amount_money?.amount ?? 0,
        status: p.status,
        createdAt: p.created_at,
        createdJst: new Date(Date.parse(p.created_at) + 9 * 3600_000)
          .toISOString()
          .replace("T", " ")
          .slice(0, 19),
        sourceType: p.source_type,
        orderId: p.order_id ?? null,
        usedFor: used[p.id] ?? null,
        note: p.note ?? null,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// カード決済はSquareアプリに飛んで行う。決済したあとブラウザに戻らずに
// Squareアプリを開いたままにしていると、こちらへ戻る合図が届かず、
// お金は受け取っているのに注文が開いたまま残る。
//
// この画面から「Squareに同じ金額の支払いがあるか」を見に行き、
// 見つかれば注文を閉じる。無ければ「まだ払われていない」と伝える。
//
// 同じ金額の注文が複数開いていることがあるので、一度使った決済は
// 使い回さない。記録しておいて次からは候補から外す。
// （これをやらないと、決済1件で複数の注文を閉じてしまう）
//
// POST { order_id }
export async function POST(req: NextRequest) {
  try {
    // payment_id を指定すると、金額が違っていてもその決済で閉じる。
    // 割り勘や値引きで注文の合計と決済額が食い違うことがあるため。
    const { order_id, payment_id } = (await req.json()) as {
      order_id?: string;
      payment_id?: string;
    };
    if (!order_id) {
      return NextResponse.json({ error: "order_id が必要です" }, { status: 400 });
    }

    const orderRes = await fetch(`${SQUARE_API}/orders/${order_id}`, { headers: hdrs() });
    const orderData = await orderRes.json();
    const order = orderData.order;
    if (!order) {
      return NextResponse.json(
        { error: orderData.errors?.[0]?.detail || "注文が見つかりません" },
        { status: 404 },
      );
    }
    if (order.state !== "OPEN") {
      return NextResponse.json({
        ok: true,
        alreadyClosed: true,
        state: order.state,
        message: `この注文はすでに${order.state === "COMPLETED" ? "完了" : "取消"}になっています。`,
      });
    }

    const total = order.total_money?.amount ?? 0;
    // 注文を作った前後の支払いだけを見る。ここを広く取ると件数が多くなり、
    // 100件の枠から古い決済がこぼれて「見つからない」ことになる。
    const created = Date.parse(order.created_at);
    const from = new Date(created - 10 * 60_000).toISOString();
    const to = new Date(Math.min(created + 12 * 3600_000, Date.now() + 60_000)).toISOString();

    const all: any[] = [];
    let cursor = "";
    for (let page = 0; page < 5; page++) {
      const url =
        `${SQUARE_API}/payments?begin_time=${encodeURIComponent(from)}` +
        `&end_time=${encodeURIComponent(to)}&sort_order=ASC&limit=100` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
      const payRes = await fetch(url, { headers: hdrs() });
      const payData = await payRes.json();
      if (!payRes.ok) {
        return NextResponse.json(
          { error: payData.errors?.[0]?.detail || "支払いを調べられませんでした" },
          { status: payRes.status },
        );
      }
      all.push(...(payData.payments || []));
      cursor = payData.cursor || "";
      if (!cursor) break;
    }

    // Squareアプリで決済すると、その決済はアプリ側が作った別の注文にひも付く。
    // こちらの注文IDとは一致しないので、金額と時刻の近さで探す。
    // ただし他の注文に使った決済は除く。
    const used = await getUsed();

    // 決済を名指しされたときは、金額の一致を問わずそれを使う
    if (payment_id) {
      const p = all.find((x: any) => x.id === payment_id);
      if (!p) {
        return NextResponse.json(
          { error: "その決済が見つかりません。画面を開き直してください。" },
          { status: 404 },
        );
      }
      if (used[p.id] && used[p.id] !== order_id) {
        return NextResponse.json(
          { error: "その決済はすでに別の注文に使われています。" },
          { status: 409 },
        );
      }
      const closed = await closeOrder(order_id, order.version);
      if (!closed.ok) {
        return NextResponse.json({
          ok: true,
          paid: true,
          closed: false,
          total,
          message: `注文を閉じられませんでした。${closed.detail ?? ""}`,
        });
      }
      await markUsed(p.id, order_id);
      const amt = p.amount_money?.amount ?? 0;
      return NextResponse.json({
        ok: true,
        paid: true,
        closed: true,
        total,
        message:
          `¥${amt.toLocaleString()} の決済でこの注文を閉じました。` +
          (amt !== total ? `（注文は¥${total.toLocaleString()}。差額は¥${(amt - total).toLocaleString()}）` : ""),
      });
    }

    const payments = all
      .filter((p: any) => !used[p.id] || used[p.id] === order_id)
      .filter(
        (p: any) =>
          (p.status === "COMPLETED" || p.status === "APPROVED") &&
          (p.amount_money?.amount ?? 0) === total,
      )
      .sort((a: any, b: any) => {
        // この注文にひも付いているものが最優先。次に注文時刻に近いもの。
        const link = (p: any) => (p.order_id === order_id ? 0 : 1);
        if (link(a) !== link(b)) return link(a) - link(b);
        return (
          Math.abs(Date.parse(a.created_at) - created) -
          Math.abs(Date.parse(b.created_at) - created)
        );
      });

    if (payments.length === 0) {
      // 同額の決済はあるが、すでに他の注文に使われていた場合は理由を分けて伝える
      const taken = all.filter(
        (p: any) =>
          (p.status === "COMPLETED" || p.status === "APPROVED") &&
          (p.amount_money?.amount ?? 0) === total &&
          used[p.id] &&
          used[p.id] !== order_id,
      );
      // 何も出さずに「ない」とだけ返すと、次に何をすればいいか分からない。
      // 前後の決済を並べて、目で見て選べるようにする。
      const nearby = all
        .filter((p: any) => p.status === "COMPLETED" || p.status === "APPROVED")
        .sort(
          (a: any, b: any) =>
            Math.abs(Date.parse(a.created_at) - created) -
            Math.abs(Date.parse(b.created_at) - created),
        )
        .slice(0, 12)
        .map((p: any) => ({
          id: p.id,
          amount: p.amount_money?.amount ?? 0,
          at: p.created_at,
          method: p.source_type,
          usedFor: used[p.id] ?? null,
        }));

      return NextResponse.json({
        ok: true,
        paid: false,
        total,
        nearby,
        message: taken.length
          ? `¥${total.toLocaleString()} の決済はありますが、すでに別の注文に使われています。` +
            "この注文はまだ会計が済んでいない可能性があります。"
          : `¥${total.toLocaleString()} の支払いはSquareに見つかりませんでした。` +
            "まだ会計が済んでいないか、金額が違う可能性があります。",
      });
    }

    // 支払いが見つかったので、開いたままの注文を閉じる。
    // 売上はSquare側の決済で計上済みなので、二重にしないためCANCELEDで閉じる。
    const done = await closeOrder(order_id, order.version);
    if (!done.ok) {
      return NextResponse.json({
        ok: true,
        paid: true,
        closed: false,
        total,
        message:
          "支払いは見つかりましたが、注文を閉じられませんでした。" +
          (done.detail ? `（${done.detail}）` : ""),
      });
    }

    const p = payments[0];
    // この決済は使い切った印を付ける。次の注文では候補に出さない。
    await markUsed(p.id, order_id);
    return NextResponse.json({
      ok: true,
      paid: true,
      closed: true,
      total,
      paidAt: p.created_at,
      method: p.source_type,
      message: `¥${total.toLocaleString()} の支払いを確認しました。注文を閉じました。`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "確認に失敗" },
      { status: 500 },
    );
  }
}
