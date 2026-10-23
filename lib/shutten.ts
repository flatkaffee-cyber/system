// 外部イベントへの出店準備。イベントごとの持ち物チェックリスト。
// KV: shutten:events（イベントの一覧） / shutten:items:<id>（そのイベントの持ち物）
//     shutten:done:<id>（チェック済みの項目。ハッシュで項目ごとに持つ）
// 当日はスタッフ全員が同じリストを見てチェックするので、端末ではなくKVに置く。
// チェックは何人かが同時に押すので、リスト全体を書き直さずに1項目ずつ記録する。

const EVENTS_KEY = "shutten:events";
const SEEDED_KEY = "shutten:seeded"; // 初期データを入れ終えたイベント・テンプレートのid（消しても復活させないため）
const TEMPLATES_KEY = "shutten:templates";
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

export type TemplateItem = { cat: string; name: string; qty?: string; note?: string };

// 新しいイベントの持ち物のもとにするリスト
export type ShuttenTemplate = {
  id: string;
  name: string;
  items: TemplateItem[];
  updatedAt: string;
};

// 分類の並び順。リストはこの順に出す。
// 前半は滋大祭（2026-10）から使っている分け方、後半はひこねいろ文化祭のときの分け方。
export const CATEGORIES = [
  "テント・設備",
  "火・調理",
  "衛生",
  "ホットサンド・ワッフル",
  "ドリンクの道具",
  "ドリンクの中身",
  "お金・書類",
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
  ["ホットサンド", "ワックスペーパー（包み紙）", "約220枚", "ふんわり包む。アルミホイルは蒸れるので使わない"],
  ["ホットサンド", "トング", "", ""],
  ["ホットサンド", "中心温度計", "1本", ""],
  ["ホットサンド", "保温用のクーラーボックス", "1個", "食材用とは別。タオルを敷き、ワックスペーパーで包んだ丸ごとを入れる。保温は15分まで"],
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
  ["冷やすもの", "クーラーボックス", "2個", "食材用と氷・ジュース用（ホットサンド保温用は別に1個）"],
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

// 滋大祭（2026-10-24・25）の持ち物。2026-10-22 に坂本さんと詰めた最終版。
const SHIDAISAI_SEED: Seed[] = [
  ["テント・設備", "テント", "", ""],
  ["テント・設備", "テーブル", "3つ", "長机は主催者からも借りられる"],
  ["テント・設備", "簡易シンク", "", ""],
  ["テント・設備", "耐熱石膏ボード", "", "買う。コンロの下に敷く（主催者の指定）"],
  ["テント・設備", "メニュー", "", ""],
  ["テント・設備", "ワッフル展示用のまな板・クリアケース", "", "買う"],
  ["テント・設備", "PayPayのQRコード", "", ""],
  ["テント・設備", "チラシ（フライヤー）", "", ""],
  ["テント・設備", "延長コード・電源タップ", "", "トースター用（電気は申請済み）"],
  ["テント・設備", "照明", "", "24日は19:00まで営業"],
  ["火・調理", "ガスコンロ", "2台", "並べずに離して置く"],
  ["火・調理", "ガスカセット", "", "予備も"],
  ["火・調理", "ホットサンドプレート", "", ""],
  ["火・調理", "トースター", "", "ワッフルを注文ごとに温め直す"],
  ["火・調理", "包丁", "", ""],
  ["火・調理", "まな板", "", ""],
  ["衛生", "アルコール消毒", "", ""],
  ["衛生", "洗剤", "", ""],
  ["衛生", "石鹸", "", ""],
  ["衛生", "ダスター", "青2枚・赤2枚", ""],
  ["衛生", "手拭きタオル", "", ""],
  ["衛生", "ニトリル手袋", "", ""],
  ["衛生", "ゴミ袋", "", "調理のゴミは自分で持ち帰る"],
  ["ホットサンド・ワッフル", "ホットサンド", "24日 クラシック36・ツナ30／25日 クラシック24・ツナ20", "25日分は店の冷蔵庫へ。余りは店で冷凍"],
  ["ホットサンド・ワッフル", "ワッフル", "24日 プレーン15・チョコ15／25日 プレーン10・チョコ10", "余りは店に置いて売る"],
  ["ホットサンド・ワッフル", "バーガー紙", "", ""],
  ["ホットサンド・ワッフル", "マーガリン・バターナイフ", "", ""],
  ["ホットサンド・ワッフル", "トング", "", ""],
  ["ホットサンド・ワッフル", "キッチンペーパー", "", "プレートを拭く"],
  ["ホットサンド・ワッフル", "保温バッグ", "", "焼いたホットサンドを種類ごとにストック"],
  ["ホットサンド・ワッフル", "シュガーパウダー・チョコソース", "", ""],
  ["ホットサンド・ワッフル", "クーラーボックス・保冷剤", "", ""],
  ["ドリンクの道具", "コーヒーの砂糖・ガムシロップ", "", ""],
  ["ドリンクの道具", "ポット", "ホット用・アイス用", "7:00に店で抽出して運ぶ"],
  ["ドリンクの道具", "マドラー・プッシャー", "", ""],
  ["ドリンクの道具", "ストロー", "", ""],
  ["ドリンクの道具", "アイススコップ・氷を入れる容器", "", ""],
  ["ドリンクの道具", "カップ：クリアカップ・ホット用カップ・ふた", "", ""],
  ["ドリンクの道具", "氷", "", "店のもの"],
  ["ドリンクの中身", "ドリップコーヒー", "", ""],
  ["ドリンクの中身", "オレンジジュース", "", "箱で持って行く"],
  ["ドリンクの中身", "グアバジュース", "", "箱で持って行く"],
  ["ドリンクの中身", "コーラ（缶）", "", "箱で持って行く"],
  ["ドリンクの中身", "ジンジャーエール（缶）", "", "梅ライムソーダ・ゆずレモネードにも使う"],
  ["ドリンクの中身", "梅ライムソーダ：梅シロップ・ライムジュース・ライム・ミント", "", ""],
  ["ドリンクの中身", "ゆずレモネード：ゆずシロップ", "", ""],
  ["お金・書類", "現金小口（釣り銭）", "", "支払いはPayPayと現金"],
  ["お金・書類", "主催者のマニュアルと段取り表", "", "段取り表の6ページ目が記録シート"],
  ["お金・書類", "ペン・ポスカ", "", "記録シート・看板の書き足し"],
];

// 毎回のもとにする基本の持ち物。滋大祭の最終版から、そのイベントだけの数や注意を外したもの。
const BASE_TEMPLATE: ShuttenTemplate = {
  id: "tpl-base",
  name: "出店の基本セット（滋大祭10月版）",
  updatedAt: "2026-10-23T00:00:00.000Z",
  items: SHIDAISAI_SEED.map(([cat, name, qty, note]) => {
    if (name === "ホットサンド") return { cat, name, qty: "種類ごとの枚数を書く", note: "前々日にたね、前日に組み立て。余りは店で冷凍" };
    if (name === "ワッフル") return { cat, name, qty: "種類ごとの枚数を書く", note: "前日の昼過ぎから約3時間で焼く。余りは店に置いて売る" };
    if (name === "照明") return { cat, name, note: "夕方以降も営業するとき" };
    if (name === "耐熱石膏ボード") return { cat, name, note: "主催者の指定があるとき。コンロの下に敷く" };
    if (name === "ワッフル展示用のまな板・クリアケース") return { cat, name };
    if (name === "延長コード・電源タップ") return { cat, name, note: "トースター用。電気を申請したときだけ使える" };
    if (name === "ポット") return { cat, name, qty: qty || undefined, note: "コーヒーは店で抽出して運ぶ" };
    if (name === "主催者のマニュアルと段取り表") return { cat, name };
    return { cat, name, qty: qty || undefined, note: note || undefined };
  }),
};

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
  {
    event: {
      id: "2026-10-24-shidaisai",
      title: "滋大祭",
      date: "2026-10-24",
      memo: "滋賀大学 裏グラウンド（からあげ たっちゃんの隣）。24日 9:30-19:00／25日 9:30-16:00、受付8:00。駐車場ハピネスひこね。緊急連絡 岩月 080-9298-4956・須藤 090-6645-4400",
    },
    items: SHIDAISAI_SEED,
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
  const list = (await store.get<ShuttenEvent[]>(EVENTS_KEY)) ?? [];
  // 初期データのうち、まだ入れていないものだけ足す。一度入れたものは、消しても戻さない
  const seeded = new Set((await store.smembers(SEEDED_KEY)) ?? []);
  const add = SEED_EVENTS.map((s) => s.event).filter(
    (e) => !seeded.has(e.id) && !list.some((x) => x.id === e.id),
  );
  const marks = SEED_EVENTS.map((s) => s.event.id).filter((id) => !seeded.has(id));
  if (add.length) {
    list.push(...add);
    list.sort((a, b) => a.date.localeCompare(b.date));
    await store.set(EVENTS_KEY, list);
  }
  if (marks.length) await store.sadd(SEEDED_KEY, marks[0], ...marks.slice(1));
  return list;
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

// 新しいイベントを作る。持ち物のもとは、テンプレート（templateId）か過去のイベント（copyFrom）。
// どちらもチェックは外して写す。
export async function createEvent(
  ev: Omit<ShuttenEvent, "id">,
  from: { copyFrom?: string; templateId?: string } = {},
): Promise<ShuttenEvent> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const events = await getEvents();
  const id = `${ev.date}-${Date.now().toString(36)}`;
  const created = { ...ev, id };
  events.push(created);
  events.sort((a, b) => a.date.localeCompare(b.date));
  await store.set(EVENTS_KEY, events);
  let base: TemplateItem[] = [];
  if (from.templateId) {
    const tpl = (await getTemplates()).find((t) => t.id === from.templateId);
    if (!tpl) throw new Error("テンプレートが見つかりません");
    base = tpl.items;
  } else if (from.copyFrom) {
    base = await getItems(from.copyFrom);
  }
  await saveItems(
    id,
    base.map((it) => ({ cat: it.cat, name: it.name, qty: it.qty, note: it.note, id: newId(), done: false })),
  );
  return created;
}

export async function getTemplates(): Promise<ShuttenTemplate[]> {
  const store = await kv();
  if (!store) return [BASE_TEMPLATE];
  const list = (await store.get<ShuttenTemplate[]>(TEMPLATES_KEY)) ?? [];
  const seeded = await store.sismember(SEEDED_KEY, BASE_TEMPLATE.id);
  if (!seeded && !list.some((t) => t.id === BASE_TEMPLATE.id)) {
    list.unshift(BASE_TEMPLATE);
    await store.set(TEMPLATES_KEY, list);
  }
  if (!seeded) await store.sadd(SEEDED_KEY, BASE_TEMPLATE.id);
  return list;
}

// イベントの今の持ち物を、テンプレートとして保存する。同じ名前があれば上書き
export async function saveTemplate(name: string, eventId: string): Promise<ShuttenTemplate> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const items = (await getList(eventId)).map(({ cat, name, qty, note }) => ({ cat, name, qty, note }));
  if (!items.length) throw new Error("持ち物が空なので保存できません");
  const list = await getTemplates();
  const i = list.findIndex((t) => t.name === name);
  const tpl: ShuttenTemplate = {
    id: i >= 0 ? list[i].id : `tpl_${Date.now().toString(36)}`,
    name,
    items,
    updatedAt: new Date().toISOString(),
  };
  if (i >= 0) list[i] = tpl;
  else list.push(tpl);
  await store.set(TEMPLATES_KEY, list);
  return tpl;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = await getTemplates();
  await store.set(TEMPLATES_KEY, list.filter((t) => t.id !== templateId));
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
