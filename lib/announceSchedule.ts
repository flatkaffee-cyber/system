// 公式LINEへの告知の予約送信（Vercel KV）。
//
// 送信そのものは /api/line/announce が行う。ここは「いつ何を送るか」を置く場所。
// 毎正時に動くcron（/api/cron/announce）が、時刻を過ぎた予約を拾って送る。
//
// 一度送ったものは sentAt を入れて残す。消さないのは、
// 「送ったつもりが送れていない」を後から確かめられるようにするため。

const KEY = "announce:scheduled";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type Scheduled = {
  id: string;
  /** どのイベントのカードを付けるか。空なら受付中のイベント全部 */
  slug: string;
  text: string;
  /** 送る時刻（ISO・JSTのオフセット付き） */
  sendAt: string;
  createdAt: string;
  sentAt?: string;
  /** 送信に失敗したときの理由。次の正時にもう一度試す */
  error?: string;
  /** 何人に送ったかの見込み */
  count?: number;
};

export async function listScheduled(): Promise<Scheduled[]> {
  const store = await kv();
  if (!store) return [];
  const list = (await store.get<Scheduled[]>(KEY)) ?? [];
  return list.sort((a, b) => a.sendAt.localeCompare(b.sendAt));
}

async function save(list: Scheduled[]): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  // 古い履歴は増え続けるので、直近30件だけ残す
  await store.set(KEY, list.slice(-30));
}

export async function addScheduled(s: Scheduled): Promise<void> {
  const list = await listScheduled();
  list.push(s);
  await save(list);
}

export async function removeScheduled(id: string): Promise<void> {
  const list = await listScheduled();
  await save(list.filter((s) => s.id !== id));
}

export async function markSent(
  id: string,
  patch: Pick<Scheduled, "sentAt" | "error" | "count">,
): Promise<void> {
  const list = await listScheduled();
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return;
  list[i] = { ...list[i], ...patch };
  await save(list);
}

/** 時刻を過ぎていて、まだ送っていないもの */
export function dueNow(list: Scheduled[], now = Date.now()): Scheduled[] {
  return list.filter((s) => !s.sentAt && Date.parse(s.sendAt) <= now);
}

export function newId(): string {
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
