// 外部イベントへの出店準備。イベントごとの持ち物チェックリスト。
// KV: shutten:events（イベントの一覧） / shutten:items:<id>（そのイベントの持ち物）
//     shutten:done:<id>（チェック済みの項目。ハッシュで項目ごとに持つ）
// 当日はスタッフ全員が同じリストを見てチェックするので、端末ではなくKVに置く。
// チェックは何人かが同時に押すので、リスト全体を書き直さずに1項目ずつ記録する。

const EVENTS_KEY = "shutten:events";
const itemsKey = (id: string) => `shutten:items:${id}`;
const doneKey = (id: string) => `shutten:done:${id}`;

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type ShuttenEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  memo?: string;
};

export type PackItem = {
  id: string;
  cat: string;
  name: string;
  qty?: string;
  note?: string;
  done: boolean;
};

// 分類の並び順。リストはこの順に出す。
export const CATEGORIES = [
  "書類・お金",
  "テントまわり",
  "火まわり",
  "ホットサンド",
  "スープ",
  "ワッフル",
  "コーヒー",
  "ソフトドリンク",
  "冷やすもの",
  "衛生",
  "ゴミ",
  "その他",
] as const;

type Seed = [cat: string, name: string, qty?: string, note?: string];

// 最初のイベント（ひこねいろ文化祭）の持ち物。2026-10-09 に洗い出したもの。
const HIKONEIRO_SEED: Seed[] = [
  ["書類・お金", "園内通行許可証 引換書 No.14", "1枚", "A4で印刷。フロントガラスに置く。帰りにB地点で許可証（正）を返す"],
  ["書類・お金", "Square端末・スマホ", "", ""],
  ["書類・お金", "モバイルバッテリー", "", ""],
  ["書類・お金", "釣り銭", "", "100円玉多め・500円玉も"],
  ["書類・お金", "売上を入れるケース", "", ""],
  ["テントまわり", "テント・横幕", "1式", ""],
  ["テントまわり", "重り", "4個", "1本15kg以上"],
  ["テントまわり", "長机", "2〜3本", ""],
  ["テントまわり", "椅子", "2〜4脚", ""],
  ["テントまわり", "床に敷くシート", "", ""],
  ["テントまわり", "看板・メニュー表・値札", "", ""],
  ["テントまわり", "アレルゲン表示", "", ""],
  ["テントまわり", "のぼり", "", "あれば"],
  ["テントまわり", "集客用チラシ", "", "店の案内・LINE友だち追加のQR"],
  ["火まわり", "2口ガスコンロ", "1台", "ホットサンド用"],
  ["火まわり", "カセットコンロ", "1台", "スープ用"],
  ["火まわり", "ガスボンベ", "", "予備も"],
  ["火まわり", "風よけ", "", ""],
  ["火まわり", "業務用ABC消火器", "1本", "主催者の指定"],
  ["ホットサンド", "ホットサンド 2種", "丸ごと各50枚", "前日仕込み。焼いて半分に切りハーフ200食"],
  ["ホットサンド", "直火式の鉄板", "2個", ""],
  ["ホットサンド", "包丁", "2〜3本", "汚れたら交換"],
  ["ホットサンド", "まな板 or クッキングシート", "", ""],
  ["ホットサンド", "包み紙", "約220枚", ""],
  ["ホットサンド", "トング", "", ""],
  ["ホットサンド", "中心温度計", "1本", ""],
  ["ホットサンド", "焼いたものを置く保温容器 or バット＋ふた", "", "ピークの作り置き用"],
  ["スープ", "スープベース", "100g×50個", "クーラーへ"],
  ["スープ", "牛乳", "約4L", "クーラーへ"],
  ["スープ", "鍋（2〜3L）・おたま", "", ""],
  ["スープ", "スープカップ＋ふた", "約55個", ""],
  ["スープ", "スプーン", "約55本", ""],
  ["ワッフル", "ワッフル（抹茶・チョコ・プレーン）", "各20個", "密閉容器に入れて運ぶ"],
  ["ワッフル", "紙袋 or 紙皿", "約65枚", ""],
  ["コーヒー", "ステンレスのエアーポット 3L", "2本", "店で淹れて持って行く。熱湯で予熱"],
  ["コーヒー", "ホットカップ＋ふた", "約35個", ""],
  ["コーヒー", "スティックシュガー・ミルク・マドラー", "", ""],
  ["ソフトドリンク", "オレンジ・パイン・グアバ", "1L×各4本", ""],
  ["ソフトドリンク", "梅ライム・ゆずレモネードの原液と炭酸水", "", "出す場合"],
  ["ソフトドリンク", "市販の袋氷", "2〜3袋", ""],
  ["ソフトドリンク", "コールドカップ＋ふた", "約70個", ""],
  ["ソフトドリンク", "ストロー", "", ""],
  ["ソフトドリンク", "氷用のスコップ", "", ""],
  ["冷やすもの", "クーラーボックス", "2個", "食材用と氷・ジュース用"],
  ["冷やすもの", "保冷剤", "", ""],
  ["冷やすもの", "温度計", "", "10℃以下を確認"],
  ["衛生", "手洗い用のコック付き給水タンク", "", ""],
  ["衛生", "ハンドソープ", "", ""],
  ["衛生", "給水用ポリタンク（水道水）", "", ""],
  ["衛生", "排水用ポリタンク", "", "持ち帰って店で捨てる"],
  ["衛生", "洗い桶", "", ""],
  ["衛生", "アルコールスプレー", "", ""],
  ["衛生", "ペーパータオル・布巾", "", ""],
  ["衛生", "使い捨て手袋", "", "多め"],
  ["衛生", "帽子・エプロン", "4人分", ""],
  ["ゴミ", "ふた付きのゴミ箱", "", "お客さん用と店用。主催者の指定"],
  ["ゴミ", "ゴミ袋", "", "多め。全部持ち帰り"],
  ["その他", "紙ナプキン", "", ""],
  ["その他", "持ち帰り用の袋", "", ""],
  ["その他", "養生テープ・マジック・はさみ・結束バンド", "", ""],
  ["その他", "雨対策のビニール・タオル", "", "小雨決行"],
];

const SEED_EVENTS: { event: ShuttenEvent; items: Seed[] }[] = [
  {
    event: {
      id: "2026-10-12-hikoneiro",
      title: "ひこねいろ文化祭",
      date: "2026-10-12",
      memo: "荒神山公園 10:00-15:00（小雨決行）。搬入8:00-9:00／搬出15:30-16:30。担当 田中 080-8513-2254、当日朝 森 090-4277-9969",
    },
    items: HIKONEIRO_SEED,
  },
];

const newId = () => `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const fromSeed = (seed: Seed[]): PackItem[] =>
  seed.map(([cat, name, qty, note], i) => ({
    id: `s${i}`,
    cat,
    name,
    qty: qty || undefined,
    note: note || undefined,
    done: false,
  }));

export async function getEvents(): Promise<ShuttenEvent[]> {
  const store = await kv();
  if (!store) return SEED_EVENTS.map((s) => s.event);
  const list = await store.get<ShuttenEvent[]>(EVENTS_KEY);
  if (list) return list;
  // 初回だけ登録済みのイベントを入れる
  const seeded = SEED_EVENTS.map((s) => s.event);
  await store.set(EVENTS_KEY, seeded);
  return seeded;
}

async function getList(id: string): Promise<PackItem[]> {
  const store = await kv();
  const seed = SEED_EVENTS.find((s) => s.event.id === id);
  if (!store) return seed ? fromSeed(seed.items) : [];
  const items = await store.get<PackItem[]>(itemsKey(id));
  if (items) return items;
  if (!seed) return [];
  const seeded = fromSeed(seed.items);
  await store.set(itemsKey(id), seeded);
  return seeded;
}

export async function getItems(id: string): Promise<PackItem[]> {
  const items = await getList(id);
  const store = await kv();
  if (!store) return items;
  const done = (await store.hgetall<Record<string, unknown>>(doneKey(id))) ?? {};
  return items.map((it) => ({ ...it, done: Boolean(done[it.id]) }));
}

async function saveItems(id: string, items: PackItem[]) {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  await store.set(itemsKey(id), items.map((it) => ({ ...it, done: false })));
}

// 新しいイベントを作る。copyFrom があれば、そのイベントの持ち物をチェックを外して写す。
export async function createEvent(
  ev: Omit<ShuttenEvent, "id">,
  copyFrom?: string,
): Promise<ShuttenEvent> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const events = await getEvents();
  const id = `${ev.date}-${Date.now().toString(36)}`;
  const created = { ...ev, id };
  events.push(created);
  events.sort((a, b) => a.date.localeCompare(b.date));
  await store.set(EVENTS_KEY, events);
  const base = copyFrom ? await getItems(copyFrom) : [];
  await saveItems(
    id,
    base.map((it) => ({ ...it, id: newId(), done: false })),
  );
  return created;
}

export async function deleteEvent(id: string): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const events = await getEvents();
  await store.set(EVENTS_KEY, events.filter((e) => e.id !== id));
  await store.del(itemsKey(id), doneKey(id));
}

export async function addItem(
  id: string,
  item: Omit<PackItem, "id" | "done">,
): Promise<void> {
  const items = await getList(id);
  items.push({ ...item, id: newId(), done: false });
  await saveItems(id, items);
}

export async function setDone(id: string, itemId: string, done: boolean): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  if (done) await store.hset(doneKey(id), { [itemId]: 1 });
  else await store.hdel(doneKey(id), itemId);
}

export async function updateItem(
  id: string,
  itemId: string,
  patch: Partial<Omit<PackItem, "id" | "done">>,
): Promise<boolean> {
  const items = await getList(id);
  const i = items.findIndex((it) => it.id === itemId);
  if (i < 0) return false;
  items[i] = { ...items[i], ...patch };
  await saveItems(id, items);
  return true;
}

export async function deleteItem(id: string, itemId: string): Promise<void> {
  const items = await getList(id);
  await saveItems(id, items.filter((it) => it.id !== itemId));
  await setDone(id, itemId, false);
}

// 帰りの積み込みなど、もう一度チェックし直したいとき用
export async function resetChecks(id: string): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  await store.del(doneKey(id));
}
