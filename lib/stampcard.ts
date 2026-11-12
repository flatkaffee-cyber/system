// flat. のスタンプカード（LINEで持つ）。
// 2026-11-12 坂本さんと決めたこと
//   ・1回の会計で ¥600 ごとにスタンプ1つ（余りは持ち越さない。¥1,300 なら2つ）
//   ・ランニングクラブに来て注文した日は、もう1つ足す
//   ・10個でドリンク1杯、30個で「Tシャツ1枚」か「ドリンクチケット5枚」を選べる。30個でカードは1枚目が終わり、次のカードへ
//   ・スタンプは会計のときに、注文画面に出るQRをお客さんがLINEで読んで付ける（1回きりのQR。家からは押せない）
//
// 持ち方: LINEの中で開くページ（/e/stamp）。LINEのアカウントで本人が分かるので、登録もパスワードもいらない。

export const YEN_PER_STAMP = 600;
export const RUN_BONUS = 1;
export const CARD_SIZE = 30;
export const MID_GOAL = 10;
/** 1回きりのQRの有効時間（秒） */
export const CODE_TTL = 15 * 60;

export type Ticket = {
  id: string;
  /** drink=ドリンク1杯 / tshirt=Tシャツ1枚 / goal=30個のごほうび（まだ選んでいない） */
  kind: "drink" | "tshirt" | "goal";
  /** どこでもらったか（「10個」「30個」など） */
  from: string;
  createdAt: string;
  usedAt?: string;
};

export type LogEntry = {
  at: string;
  /** earn=スタンプが付いた / use=チケットを使った / choose=30個のごほうびを選んだ / adjust=手で直した */
  type: "earn" | "use" | "choose" | "adjust";
  stamps?: number;
  amount?: number;
  run?: boolean;
  note?: string;
};

export type Card = {
  id: string;
  lineUserId?: string;
  name: string;
  /** いまのカードのスタンプ（0〜29） */
  stamps: number;
  /** これまでにもらったスタンプの合計 */
  totalStamps: number;
  /** 30個まで集めたカードの枚数 */
  completed: number;
  tickets: Ticket[];
  log: LogEntry[];
  createdAt: string;
  lastAt?: string;
};

export type IssuedCode = { stamps: number; amount: number; run: boolean; createdAt: string; orderId?: string };

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}
async function store() {
  const s = await kv();
  if (!s) throw new Error("KV未設定");
  return s;
}

// カードは1枚ずつハッシュの1項目に置く（1枚書くときに、ほかの人のカードを書き戻さないため）
const CARDS = "stamp:card";
const BY_LINE = "stamp:byLine";
const codeKey = (c: string) => `stamp:code:${c}`;
const orderKey = (o: string) => `stamp:order:${o}`;
const lockKey = (id: string) => `stamp:lock:${id}`;
const usedKey = (ticketId: string) => `stamp:used:${ticketId}`;

const rid = (n: number) => {
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const buf = crypto.getRandomValues(new Uint8Array(n));
  for (const b of buf) s += a[b % a.length];
  return s;
};

/** その会計で付くスタンプの数 */
export function stampsFor(amount: number, run: boolean): number {
  const base = Math.floor(Math.max(0, amount) / YEN_PER_STAMP);
  // ランニングの日は、注文があれば ¥600 に届かなくても+1（¥500のドリンクでも1つ）
  return base + (run && amount > 0 ? RUN_BONUS : 0);
}

export async function getCards(): Promise<Record<string, Card>> {
  return ((await (await store()).hgetall<Record<string, Card>>(CARDS)) ?? {});
}
async function getCard(id: string): Promise<Card | null> {
  return ((await (await store()).hget<Card>(CARDS, id)) ?? null);
}
async function saveCard(c: Card) {
  await (await store()).hset(CARDS, { [c.id]: c });
}

/**
 * 1枚のカードを、ほかの書き込みと重ならないように読み直して書き換える。
 * 同じお客さんが2台で同時に押しても、片方の変更が消えないようにする
 */
async function withCard<T>(id: string, fn: (c: Card) => T | Promise<T>): Promise<{ card: Card; result: T }> {
  const s = await store();
  const token = rid(8);
  for (let i = 0; i < 30; i++) {
    const ok = await s.set(lockKey(id), token, { nx: true, ex: 10 });
    if (ok) {
      try {
        const c = await getCard(id);
        if (!c) throw new Error("カードが見つかりません");
        const result = await fn(c);
        await saveCard(c);
        return { card: c, result };
      } finally {
        if ((await s.get<string>(lockKey(id))) === token) await s.del(lockKey(id));
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("混み合っています。少し待ってから、もう一度押してください");
}

/** LINEのアカウントのカード。無ければ作る（同時に2回開いても、カードは1枚だけ） */
export async function cardForLine(lineUserId: string, name: string): Promise<Card> {
  const s = await store();
  const known = await s.hget<string>(BY_LINE, lineUserId);
  if (known) {
    const c = await getCard(known);
    if (c) {
      if (name && c.name !== name) return (await withCard(c.id, (x) => void (x.name = name))).card;
      return c;
    }
  }
  const c: Card = {
    id: rid(10),
    lineUserId,
    name: name || "ゲスト",
    stamps: 0,
    totalStamps: 0,
    completed: 0,
    tickets: [],
    log: [],
    createdAt: new Date().toISOString(),
  };
  await saveCard(c);
  const won = await s.hsetnx(BY_LINE, lineUserId, c.id);
  if (!won) {
    // ほぼ同時に別の画面がカードを作っていた。そちらを使う
    await s.hdel(CARDS, c.id);
    const other = await s.hget<string>(BY_LINE, lineUserId);
    const oc = other ? await getCard(other) : null;
    if (oc) return oc;
  }
  return c;
}

/** スタンプを足す。10個でドリンク1杯、30個でごほうび（選ぶ）を渡し、30個を超えた分は次のカードへ */
export function addStamps(c: Card, n: number, entry: Omit<LogEntry, "at" | "type" | "stamps">): Card {
  const now = new Date().toISOString();
  let left = n;
  while (left > 0) {
    const before = c.stamps;
    const take = Math.min(left, CARD_SIZE - before);
    c.stamps = before + take;
    left -= take;
    if (before < MID_GOAL && c.stamps >= MID_GOAL) {
      c.tickets.push({ id: rid(8), kind: "drink", from: `${MID_GOAL}個`, createdAt: now });
    }
    if (c.stamps >= CARD_SIZE) {
      c.tickets.push({ id: rid(8), kind: "goal", from: `${CARD_SIZE}個`, createdAt: now });
      c.completed += 1;
      c.stamps = 0;
    }
  }
  c.totalStamps += n;
  c.lastAt = now;
  c.log.unshift({ at: now, type: "earn", stamps: n, ...entry });
  c.log = c.log.slice(0, 200);
  return c;
}

/** 会計のQRを作る。同じ注文には同じQRを返す（二重に出さない） */
export async function issueCode(amount: number, run: boolean, orderId?: string): Promise<{ code: string; stamps: number }> {
  const s = await store();
  if (orderId) {
    const prev = await s.get<string>(orderKey(orderId));
    if (prev) {
      const v = await s.get<IssuedCode>(codeKey(prev));
      if (v) return { code: prev, stamps: v.stamps };
    }
  }
  const stamps = stampsFor(amount, run);
  if (stamps <= 0) throw new Error(`¥${YEN_PER_STAMP}より少ない会計には、ランニングの日でないとスタンプが付きません`);
  const code = rid(12);
  await s.set(codeKey(code), { stamps, amount, run, createdAt: new Date().toISOString(), orderId } satisfies IssuedCode, { ex: CODE_TTL });
  if (orderId) await s.set(orderKey(orderId), code, { ex: 7 * 86_400 });
  return { code, stamps };
}

/** お客さんがQRを読んだ。1回きり（読むのと消すのを一度にやるので、2人が同時に読んでも1人にしか付かない） */
export async function redeemCode(cardId: string, code: string): Promise<{ card: Card; added: number } | { error: string }> {
  const s = await store();
  const v = await s.getdel<IssuedCode>(codeKey(code));
  if (!v) return { error: "このQRは使えません（使用済みか、15分を過ぎています）。お店の人に声をかけてください" };
  const { card } = await withCard(cardId, (c) => addStamps(c, v.stamps, { amount: v.amount, run: v.run }));
  return { card, added: v.stamps };
}

/** チケットを使う（お店の人の前で押してもらう）。2台で同時に押しても1回しか使えない */
export async function useTicket(cardId: string, ticketId: string): Promise<Card> {
  const s = await store();
  const first = await s.set(usedKey(ticketId), "1", { nx: true, ex: 400 * 86_400 });
  if (!first) throw new Error("このチケットはもう使っています");
  try {
    return (
      await withCard(cardId, (c) => {
        const t = c.tickets.find((x) => x.id === ticketId);
        if (!t) throw new Error("チケットが見つかりません");
        if (t.usedAt) throw new Error("このチケットはもう使っています");
        if (t.kind === "goal") throw new Error("先に、Tシャツかドリンクチケットを選んでください");
        t.usedAt = new Date().toISOString();
        c.log.unshift({ at: t.usedAt, type: "use", note: t.kind === "tshirt" ? "Tシャツ" : "ドリンク1杯" });
      })
    ).card;
  } catch (e) {
    // 使えなかったときは、印を外して元に戻す
    await s.del(usedKey(ticketId));
    throw e;
  }
}

/** 30個のごほうびを選ぶ。Tシャツ1枚か、ドリンクチケット5枚（1回だけ選べる） */
export async function chooseGoal(cardId: string, ticketId: string, choice: "tshirt" | "drink5"): Promise<Card> {
  const s = await store();
  const first = await s.set(usedKey(ticketId), "1", { nx: true, ex: 400 * 86_400 });
  if (!first) throw new Error("このごほうびはもう選んでいます");
  try {
    return (
      await withCard(cardId, (c) => {
        const t = c.tickets.find((x) => x.id === ticketId);
        if (!t || t.kind !== "goal" || t.usedAt) throw new Error("選べるごほうびが見つかりません");
        const now = new Date().toISOString();
        c.tickets = c.tickets.filter((x) => x.id !== ticketId);
        if (choice === "tshirt") c.tickets.push({ id: rid(8), kind: "tshirt", from: `${CARD_SIZE}個`, createdAt: now });
        else for (let i = 0; i < 5; i++) c.tickets.push({ id: rid(8), kind: "drink", from: `${CARD_SIZE}個`, createdAt: now });
        c.log.unshift({ at: now, type: "choose", note: choice === "tshirt" ? "Tシャツ" : "ドリンクチケット5枚" });
      })
    ).card;
  } catch (e) {
    await s.del(usedKey(ticketId));
    throw e;
  }
}

/** お客さんの画面に出す形（LINEのIDは出さない） */
export function publicCard(c: Card) {
  return {
    name: c.name,
    stamps: c.stamps,
    totalStamps: c.totalStamps,
    completed: c.completed,
    tickets: c.tickets.filter((t) => !t.usedAt),
    used: c.tickets.filter((t) => t.usedAt).slice(-5),
    log: c.log.slice(0, 10),
  };
}

/** イベント申込と同じLIFF（/e が入口）。チャンネルIDはLIFF IDの「-」の前 */
export const STAMP_LIFF_ID =
  process.env.NEXT_PUBLIC_LIFF_ID_EVENT ||
  process.env.NEXT_PUBLIC_LIFF_ID_DJNIGHT ||
  process.env.NEXT_PUBLIC_LIFF_ID_NATSUMATSURI ||
  "";

/**
 * LINEのアクセストークンを確かめて、本人のLINEのIDと名前を返す。
 * 画面から送られたIDをそのまま信じると、他人のカードを開けてしまうため、必ずLINEに聞いて確かめる。
 * （IDトークンは openid の権限が要るので、プロフィールの権限だけで済むアクセストークンを使う）
 */
export async function verifyLineAccessToken(accessToken: string): Promise<{ sub: string; name: string }> {
  const channelId = STAMP_LIFF_ID.split("-")[0];
  if (!channelId) throw new Error("LINEの設定がありません");
  const v = await fetch(`https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`);
  const vd = await v.json().catch(() => ({}));
  if (!v.ok || String(vd.client_id) !== channelId || !(Number(vd.expires_in) > 0)) {
    throw new Error("LINEで本人を確かめられませんでした。LINEのアプリから開き直してください");
  }
  const p = await fetch("https://api.line.me/v2/profile", { headers: { Authorization: `Bearer ${accessToken}` } });
  const pd = await p.json().catch(() => ({}));
  if (!p.ok || !pd.userId) throw new Error("LINEのプロフィールが読めませんでした");
  return { sub: String(pd.userId), name: String(pd.displayName || "") };
}
