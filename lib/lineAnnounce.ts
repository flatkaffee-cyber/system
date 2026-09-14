// 公式LINEへの一斉送信。
//
// 申込済みの人だけ外して送るにはナローキャストが要るが、
// LINE側の制限で最終的な配信対象が50人以上ないと使えない。
// flat.の友だちは50人以下なので、全員に送って文面で吸収する。
//
// 通数は「メッセージ数 × 人数」で数えられる。テキストとカードで1人2通。

import { eventMessage, eventCarousel } from "@/lib/lineEvents";

const API = "https://api.line.me/v2/bot";

export function lineToken(): string {
  return process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
}

export async function lineGet<T>(path: string): Promise<T | null> {
  const t = lineToken();
  if (!t) return null;
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${t}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** 友だち数。insightは前日以前しか返らないので数日遡って探す */
export async function followerCount(): Promise<number | null> {
  for (let back = 1; back <= 3; back++) {
    const d = new Date(Date.now() + 9 * 3600 * 1000 - back * 86400 * 1000);
    const ymd = d.toISOString().slice(0, 10).replaceAll("-", "");
    const r = await lineGet<{ status?: string; followers?: number }>(
      `/insight/followers?date=${ymd}`,
    );
    if (r?.status === "ready" && typeof r.followers === "number") return r.followers;
  }
  return null;
}

/** 送るメッセージを組み立てる。slugが空なら受付中のイベント全部のカルーセル */
export function buildMessages(slug: string, text: string, card = true): unknown[] {
  const messages: unknown[] = [];
  if (text.trim()) messages.push({ type: "text", text: text.trim() });
  if (card) {
    const c = slug ? eventMessage(slug) : eventCarousel();
    if (!c) throw new Error(`知らないイベントです: ${slug}`);
    messages.push(c);
  }
  if (messages.length === 0) throw new Error("送る中身がありません");
  return messages;
}

/** 友だち全員に送る。予約送信のcronからも呼ぶ */
export async function broadcast(messages: unknown[]): Promise<{ count: number | null }> {
  const t = lineToken();
  if (!t) throw new Error("LINE_CHANNEL_ACCESS_TOKEN が未設定");
  const res = await fetch(`${API}/message/broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    throw new Error(`送信に失敗(${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const followers = await followerCount();
  return { count: followers != null ? followers * messages.length : null };
}
