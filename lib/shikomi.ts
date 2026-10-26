// 仕込みの予定と記録（内部用）。
// 「店に来たときに何を仕込むか」が分かることが目的。
// 仕込んだ日・切れた日を記録し、そこから「期限の日」「切れた次の日」「決まった曜日」で今日の仕込みを出す。
// 量は1回ごとに決めておき、その分だけ仕込む。予定より早く切れた回は analyze() で見る。

import { isWeekA } from "@/lib/opening";

const KEY = "shikomi:records";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type TaskKind = "仕込み" | "確認" | "清掃";

export type Task = {
  id: string;
  name: string;
  kind: TaskKind;
  /** 本来の予定で何日おきに仕込むか。曜日固定のものは目安（分析で使う） */
  intervalDays: number;
  /** 消費期限（仕込んだ日から何日もつか）。この日数が経った日に仕込み直す */
  shelfLifeDays?: number;
  /** 1回に仕込む量（決まった量だけ仕込む）。数値と単位 */
  batch?: number;
  unit?: string;
  /** 曜日で量が違うもの。0=日 */
  batchByWeekday?: Partial<Record<number, number>>;
  /** 1斤から何食とれるか（ホットサンド）。量の横に斤数を出す */
  perLoaf?: number;
  /** 決まった曜日に仕込むもの。0=日 */
  weekday?: number[];
  /** 2週に1回（A週だけ） */
  biweekly?: boolean;
  /** 1回あたりの分量（数値で持てないものの説明） */
  qty?: string;
  /** 使う材料と量。発注量の目安にもなる */
  materials?: string;
  note?: string;
  /** 目安の所要時間（分） */
  minutes?: number;
  /** 使う材料（lib/stockroom の品目id）。在庫確認で「次の仕込みに要るもの」として並べる */
  needs?: string[];
  /**
   * 業務チェックの別の作業で出しているもの（コールドブリューの残数チェックなど）。
   * その作業にチェックすると仕込みとして記録するので、「今日の仕込み」の一覧には出さない
   */
  openingTask?: string;
};

/**
 * 定期作業の一覧。増やすときはここに足す。
 * 2026-10-26〜 仕込みは「消費期限」「1回の量」を決めて回す。
 *   ・期限の日数が経った日に仕込む
 *   ・切れたら次の日に仕込む（業務チェックの締めで「切れた」を押す）
 *   ・曜日の決まったものは、その曜日にも仕込む
 * 量は決めた分だけ仕込む。足りなくて予定より早く仕込んだ回数は 「仕込み」画面の分析に出る。
 * 期限・量の「仮」は坂本さん確認待ちの初期値。
 */
export const TASKS: Task[] = [
  {
    id: "hotsand-classic",
    name: "ホットサンド（クラシックメルト）",
    kind: "仕込み",
    intervalDays: 3.5,
    weekday: [3, 0],
    // 2026-10-26 店内（Square 9/1〜10/22）＋Uber（9/16〜10/25）の売れ方から決めた。
    // 水曜の分は水曜午後〜日曜昼（約15.9食）、日曜の分は日曜午後〜水曜昼（約7.3食）に1〜2割の余裕を足して斤で丸めた
    batch: 18,
    batchByWeekday: { 3: 18, 0: 9 },
    unit: "個",
    perLoaf: 3,
    shelfLifeDays: 10, // 冷凍。2026-10-26 坂本さん決定
    needs: ["bread", "ham", "cream-cheese", "mustard", "ketchup", "margarine"],
    note: "午前にタネ、午後に挟んで焼いて冷凍。冷凍で10日",
    minutes: 90,
  },
  {
    id: "hotsand-garden",
    name: "ホットサンド（ガーデンメルト）",
    kind: "仕込み",
    intervalDays: 3.5,
    weekday: [3, 0],
    // 水曜の分は約12.7食、日曜の分は約7.0食（店内＋Uber）。同じく余裕を足して斤で丸めた
    batch: 15,
    batchByWeekday: { 3: 15, 0: 9 },
    unit: "個",
    perLoaf: 3,
    shelfLifeDays: 10, // 冷凍。2026-10-26 坂本さん決定
    needs: ["bread", "tuna", "broccoli", "mayo", "shred-cheese", "genovese", "mustard", "margarine"],
    note: "クラシックと同じ日にまとめて仕込む。冷凍で10日",
    minutes: 60,
  },
  {
    id: "soup-base",
    name: "スープのベース（パンプキン）",
    kind: "仕込み",
    intervalDays: 14,
    weekday: [4],
    biweekly: true,
    batch: 16,
    unit: "個",
    shelfLifeDays: 30, // 冷凍。仮
    needs: ["pumpkin-puree", "cut-onion", "butter", "consomme"],
    qty: "100gずつ冷凍",
    note: "2週に1回、A週の木曜。作り方は「🍳 レシピ」のパンプキンスープ。冷凍の日持ちは仮で30日",
    minutes: 60,
  },
  {
    id: "mashed-potato",
    name: "マッシュポテトの仕込み",
    kind: "仕込み",
    intervalDays: 10,
    shelfLifeDays: 10,
    // 2026-10-26 800g→300g。9/1〜10/25の55日で生ハム包み8・マッシュポテト4・3種盛り2・ソーセージ1、10日で約200〜250gしか使わない
    batch: 300,
    unit: "g",
    materials: "ポテトフレーク 約56g（800gのとき150gの割合）",
    needs: ["potato-flake"],
    note: "タッパに入れて冷蔵。容器に仕込んだ日付を書く",
    minutes: 15,
  },
  {
    id: "amiebi-cream-cheese",
    name: "あみえびのクリームチーズ",
    kind: "仕込み",
    // 2026-10-26 坂本さん決定：2食分を毎週水曜に。1週間に1食も出ないこともあるので量を減らし、期限を7日に。
    // 2食出たら（切れたら）その日か次の日に仕込む。材料は月曜に確かめ、なければ平和堂に水曜着で手配する
    intervalDays: 7,
    weekday: [3],
    shelfLifeDays: 7,
    // 2026-10-26 量は食分ではなくgで持つ（仕込んだ量を毎回gで入れるため）。1食約30g×2食
    batch: 60,
    unit: "g",
    qty: "約2食分",
    // 2026-10-26 坂本さん決定：大葉は最初から混ぜる（1か月半冷蔵しても水が出ず傷まなかった実績）。期限は7日のまま
    materials: "クリームチーズ・あみえびうま煮・大葉",
    needs: ["cream-cheese", "amiebi-umani", "shiso"],
    note:
      "あみえびうま煮は冷凍のタッパから使う分だけ出し、残りはそのまま冷凍に戻す（全部は解凍しない）。" +
      "大葉は最初から混ぜる。容器に仕込んだ日付を書く",
    minutes: 15,
  },
  {
    id: "sauerkraut",
    name: "ザワークラウトの仕込み",
    kind: "仕込み",
    // 1回で約800g＝4皿分。2026-10-23 坂本さん決定：2か月に1回（8週）
    intervalDays: 56,
    shelfLifeDays: 60,
    batch: 800,
    unit: "g",
    qty: "キャベツ1kg分",
    materials: "キャベツ 1kg / 塩 20g（キャベツの2%） / ピンクペッパー・ローリエ 適量",
    needs: ["cabbage"],
    note:
      "千切りにして塩で揉み、汁ごと容器に詰めて液面の下に沈める。常温で発酵（夏3日・冬7日）させてから冷蔵。冷蔵で2ヶ月もつ",
    minutes: 20,
  },
  {
    id: "ajillo-set",
    name: "アヒージョのセット仕込み",
    kind: "仕込み",
    intervalDays: 7,
    shelfLifeDays: 14, // 冷凍。仮
    batch: 6, // 仮
    unit: "セット",
    materials:
      "1セット: オリーブオイル50ml / ミニトマト2個くし切り / マッシュルーム1個厚スライス / ブロッコリー2個 / 殻付き大アサリ2個 / むき海老2尾",
    needs: ["tomato", "mushroom", "broccoli", "asari", "shrimp", "garlic"],
    note: "セットにして冷凍保存。提供時はスキレットで火を入れるだけにする",
    minutes: 30,
  },
  {
    id: "cold-brew",
    name: "コールドブリューの仕込み",
    kind: "仕込み",
    intervalDays: 3,
    shelfLifeDays: 3, // 仮
    batch: 2,
    unit: "本",
    note: "業務チェックの「コールドブリューを仕込む」にチェックすると、ここにも記録される",
    minutes: 15,
    openingTask: "daily-prep",
  },
  {
    id: "stock-check",
    name: "在庫の確認",
    kind: "確認",
    intervalDays: 7,
    note: "冷蔵庫・冷凍庫・棚。切れそうなものは発注へ",
    minutes: 30,
  },
];

// ---- 画面から変えた設定 ----
// TASKS はコードに書いた初期値。画面（仕込み・在庫 → 仕込みの設定）で変えた分を KV に持ち、上から重ねる。
// 画面で足した仕込み品も同じところに入る。

const SETTINGS_KEY = "shikomi:settings";

export type TaskEdit = Partial<Omit<Task, "id">> & { hidden?: boolean };
export type ShikomiSettings = {
  /** 初期値から変えたところ（id ごと） */
  edits: Record<string, TaskEdit>;
  /** 画面で足した仕込み品 */
  added: Task[];
};

export async function getSettings(): Promise<ShikomiSettings> {
  const store = await kv();
  const s = store ? await store.get<ShikomiSettings>(SETTINGS_KEY) : null;
  return { edits: s?.edits ?? {}, added: s?.added ?? [] };
}

async function putSettings(s: ShikomiSettings) {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  await store.set(SETTINGS_KEY, s);
}

/** 初期値に画面の設定を重ねた一覧。hidden を付けたものは includeHidden のときだけ返す */
export async function getTasks(includeHidden = false): Promise<(Task & { hidden?: boolean; isAdded?: boolean; isEdited?: boolean })[]> {
  const s = await getSettings();
  const base = TASKS.map((t) => ({ ...t, ...(s.edits[t.id] ?? {}), id: t.id, isEdited: !!s.edits[t.id] }));
  const added = s.added.map((t) => ({ ...t, ...(s.edits[t.id] ?? {}), id: t.id, isAdded: true }));
  return [...base, ...added].filter((t) => includeHidden || !t.hidden);
}

/** 1品目の設定を変える。null を渡した項目は初期値に戻す */
export async function editTask(id: string, patch: Record<string, unknown>) {
  const s = await getSettings();
  // 画面で足したものは、足した中身をそのまま書き換える（初期値が無いので重ねる意味がない）
  const added = s.added.find((t) => t.id === id);
  if (added) {
    const a = added as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      if (k === "id" || k === "kind") continue;
      if (v === null) delete a[k];
      else a[k] = v;
    }
    await putSettings(s);
    return;
  }
  const cur: Record<string, unknown> = { ...(s.edits[id] ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "id") continue;
    if (v === null) delete cur[k];
    else cur[k] = v;
  }
  if (Object.keys(cur).length) s.edits[id] = cur as TaskEdit;
  else delete s.edits[id];
  await putSettings(s);
}

/** 初期値に戻す（画面で足したものは消える） */
export async function resetTask(id: string) {
  const s = await getSettings();
  delete s.edits[id];
  s.added = s.added.filter((t) => t.id !== id);
  await putSettings(s);
}

export async function addTask(t: Omit<Task, "id" | "kind"> & { id?: string }) {
  const s = await getSettings();
  const id = t.id || `custom-${Date.now().toString(36)}`;
  if (TASKS.some((x) => x.id === id) || s.added.some((x) => x.id === id)) throw new Error("同じIDがあります");
  s.added.push({ ...t, id, kind: "仕込み" });
  await putSettings(s);
  return id;
}

/**
 * 実施の記録。組込みのRecord型と紛らわしいのでDoneLogにしている。
 * type が無いものは「仕込んだ」（2026-10-26 より前の記録はすべてこれ）。
 * "out" は「切れた」。切れた次の日が仕込む日になる。
 * "plan" は在庫確認で「仕込む」を押したもの。date はその仕込みをする日（押した日の次の営業日）。
 */
export type DoneLog = {
  taskId: string;
  date: string;
  type?: "made" | "out" | "plan";
  /** 仕込んだ量（決まった量から変えたときだけ意味がある） */
  qty?: number;
  /** 記録した時刻。同じ日に「切れた」と「仕込んだ」が両方あるときの前後に使う */
  at?: string;
  note?: string;
  by?: string;
};

const isOut = (r: DoneLog) => r.type === "out";
const isPlan = (r: DoneLog) => r.type === "plan";
/** 仕込んだ記録か（type が無い古い記録も含む） */
const isMade = (r: DoneLog) => !r.type || r.type === "made";
const recType = (r: DoneLog) => r.type ?? "made";

/** その日の次の営業日（火曜は定休日なので飛ばす） */
export function nextBizDay(date: string): string {
  let d = addDays(date, 1);
  if (weekdayOf(d) === 2) d = addDays(d, 1);
  return d;
}

export async function getRecords(): Promise<DoneLog[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<DoneLog[]>(KEY)) ?? [];
}

export async function addRecord(r: DoneLog): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<DoneLog[]>(KEY)) ?? [];
  // 同じ日に同じ記録を二重につけない（二度押し・業務チェックとの重なり）
  if (list.some((x) => x.taskId === r.taskId && x.date === r.date && recType(x) === recType(r))) return;
  list.push({ ...r, at: r.at ?? new Date().toISOString() });
  await store.set(KEY, list);
}

export async function removeRecord(
  taskId: string,
  date: string,
  type: "made" | "out" | "plan" = "made",
): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<DoneLog[]>(KEY)) ?? [];
  const i = list.findIndex(
    (x) => x.taskId === taskId && x.date === date && recType(x) === type,
  );
  if (i >= 0) {
    list.splice(i, 1);
    await store.set(KEY, list);
  }
}

// 業務チェックと同じく朝6時で日付を切り替える。締めで深夜に押しても、その営業日の記録になる
export const todayJST = () =>
  new Date(Date.now() + (9 - 6) * 3600_000).toISOString().slice(0, 10);

const addDays = (d: string, n: number) =>
  new Date(new Date(d + "T00:00:00Z").getTime() + n * 86_400_000)
    .toISOString()
    .slice(0, 10);

const dayDiff = (a: string, b: string) =>
  Math.round(
    (new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) /
      86_400_000,
  );

const weekdayOf = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();
const WD = ["日", "月", "火", "水", "木", "金", "土"];

/** その日が曜日固定の予定日か */
export function isScheduledDay(t: Task, date: string): boolean {
  if (!t.weekday?.includes(weekdayOf(date))) return false;
  return t.biweekly ? isWeekA(date) : true;
}

/** その日に仕込む量 */
export function batchOn(t: Task, date: string): number | undefined {
  return t.batchByWeekday?.[weekdayOf(date)] ?? t.batch;
}

/** 量の表示。ホットサンドは斤数も添える */
export function batchLabel(t: Task, date: string): string {
  const n = batchOn(t, date);
  if (n === undefined) return t.qty ?? "";
  const loaf = t.perLoaf ? `（食パン${Math.round((n / t.perLoaf) * 10) / 10}斤）` : "";
  return `${n}${t.unit ?? ""}${loaf}${t.qty && !t.perLoaf ? `・${t.qty}` : ""}`;
}

/** 前回仕込んだ日から見た、本来の次の予定日 */
export function plannedNext(t: Task, from: string): string {
  if (t.weekday?.length) {
    for (let i = 1; i <= 28; i++) {
      const d = addDays(from, i);
      if (isScheduledDay(t, d)) return d;
    }
  }
  return addDays(from, Math.round(t.intervalDays));
}

export type Status = "overdue" | "today" | "soon" | "ok" | "never";

/** 今日仕込む理由 */
export type DueReason = "記録なし" | "切れた" | "在庫確認" | "期限" | "予定日";

export type TaskState = Task & {
  lastDate: string | null;
  /** 前回からの経過日数 */
  daysSince: number | null;
  /** 消費期限の日（この日に仕込み直す） */
  expiresOn: string | null;
  /** 切れたと記録した日（前回の仕込みより後のもの） */
  outOn: string | null;
  /** 在庫確認で「仕込む」と決めた日（その仕込みをする日） */
  planOn: string | null;
  /** 次に仕込む日。期限・切れた次の日・予定日のうち早いほう */
  nextDate: string | null;
  /** 次回まであと何日。マイナスは超過 */
  daysUntil: number | null;
  status: Status;
  /** 今日仕込む理由。今日の仕込み記録より前の状態で判断する（仕込んだあとも一覧に残すため） */
  dueReasons: { reason: DueReason; text: string }[];
  /** 今日の量（表示用） */
  todayBatch: string;
  /** 今日の量（数値）。仕込んだ量の入力欄の初期値 */
  todayBatchNum: number | null;
  /** 今日仕込んだ量（入れたとき） */
  todayQty: number | null;
  doneToday: boolean;
  outToday: boolean;
  history: DoneLog[];
};

const after = (a: DoneLog, b: DoneLog) =>
  a.date > b.date || (a.date === b.date && (a.at ?? "") > (b.at ?? ""));

function stateOf(t: Task, records: DoneLog[], today: string) {
  const mine = records.filter((r) => r.taskId === t.id);
  const made = mine.filter(isMade).sort((a, b) => (after(a, b) ? -1 : 1));
  const last = made[0] ?? null;
  const out = mine
    .filter((r) => isOut(r) && (!last || after(r, last)))
    .sort((a, b) => (after(a, b) ? -1 : 1))[0] ?? null;
  // 在庫確認で「仕込む」と決めたもの（前回の仕込みより後に押したもの）。いちばん早い日
  const plan = mine
    .filter((r) => isPlan(r) && (!last || after(r, last)))
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0] ?? null;
  const lastDate = last?.date ?? null;
  const expiresOn = lastDate && t.shelfLifeDays ? addDays(lastDate, t.shelfLifeDays) : null;
  const outNext = out ? addDays(out.date, 1) : null;
  const sched = lastDate ? plannedNext(t, lastDate) : null;
  const nextDate = [expiresOn, outNext, plan?.date ?? null, sched].filter((x): x is string => !!x).sort()[0] ?? null;

  const reasons: { reason: DueReason; text: string }[] = [];
  {
    // 曜日の決まったものは、記録が無くても次の決まった曜日から始める
    if (!lastDate && !t.weekday?.length) reasons.push({ reason: "記録なし", text: "仕込んだ記録がまだない" });
    if (plan && plan.date <= today)
      reasons.push({ reason: "在庫確認", text: "在庫確認で仕込むと決めた" });
    if (outNext && outNext <= today)
      reasons.push({ reason: "切れた", text: `${out!.date.slice(5).replace("-", "/")}に切れた` });
    if (expiresOn && expiresOn <= today)
      reasons.push({
        reason: "期限",
        text: expiresOn === today ? "今日が期限" : `期限${expiresOn.slice(5).replace("-", "/")}を過ぎている`,
      });
    // 曜日の決まっていないものは、期限と予定日が同じ日になりやすいので重ねて出さない
    const expiredNow = reasons.some((r) => r.reason === "期限");
    if (t.weekday?.length ? isScheduledDay(t, today) : sched !== null && sched <= today && !expiredNow)
      reasons.push({
        reason: "予定日",
        text: t.weekday?.length ? `${WD[weekdayOf(today)]}曜の仕込み日` : "予定の日",
      });
  }
  return { last, out, plan, lastDate, expiresOn, nextDate, reasons };
}

export function buildStates(all: DoneLog[], today = todayJST(), tasks: Task[] = TASKS): TaskState[] {
  // 先の日付の記録（日付を指定して見たとき）は混ぜない
  const records = all.filter((r) => r.date <= today);
  return tasks.map((t) => {
    const full = stateOf(t, records, today);
    // 今日仕込む理由は、今日の「仕込んだ」を除いた記録で見る
    const before = stateOf(
      t,
      records.filter((r) => !(r.taskId === t.id && r.date === today && isMade(r))),
      today,
    );
    const history = records
      .filter((r) => r.taskId === t.id)
      .sort((a, b) => (after(a, b) ? -1 : 1));
    const daysSince = full.lastDate ? dayDiff(full.lastDate, today) : null;
    const daysUntil = full.nextDate ? dayDiff(today, full.nextDate) : null;

    let status: Status;
    if (!full.lastDate) status = "never";
    else if (daysUntil === null) status = "ok";
    else if (daysUntil < 0) status = "overdue";
    else if (daysUntil === 0) status = "today";
    else if (daysUntil <= 1) status = "soon";
    else status = "ok";

    return {
      ...t,
      lastDate: full.lastDate,
      daysSince,
      expiresOn: full.expiresOn,
      outOn: full.out?.date ?? null,
      planOn: full.plan?.date ?? null,
      nextDate: full.nextDate,
      daysUntil,
      status,
      dueReasons: before.reasons,
      todayBatch: batchLabel(t, today),
      todayBatchNum: batchOn(t, today) ?? null,
      todayQty: history.find((r) => r.date === today && isMade(r))?.qty ?? null,
      doneToday: history.some((r) => r.date === today && isMade(r)),
      outToday: history.some((r) => r.date === today && isOut(r)),
      history: history.slice(0, 12),
    };
  }).sort((a, b) => {
    const rank: { [K in Status]: number } = {
      never: 0,
      overdue: 1,
      today: 2,
      soon: 3,
      ok: 4,
    };
    return rank[a.status] - rank[b.status] || (a.daysUntil ?? 0) - (b.daysUntil ?? 0);
  });
}

// ---- 分析：予定よりどれだけ早く仕込んでいるか ----

export type Cycle = {
  from: string;
  to: string;
  /** 実際に何日もったか */
  actualDays: number;
  /** 本来の予定では何日後だったか */
  plannedDays: number;
  /** 予定より何日早かったか（マイナスは遅れ） */
  earlyDays: number;
  /** 仕込み直したきっかけ */
  trigger: "切れた" | "期限" | "予定どおり" | "早め" | "遅れ";
  /** その回に仕込んだ量 */
  qty?: number;
};

export type Analysis = {
  id: string;
  name: string;
  unit?: string;
  plannedDays: number;
  cycles: Cycle[];
  avgActualDays: number | null;
  avgEarlyDays: number | null;
  outCount: number;
  expireCount: number;
  /** 切れた回から出した1日あたりの消費量 */
  perDay: number | null;
  /** 量の見直し案 */
  advice: string;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function analyze(records: DoneLog[], today = todayJST(), tasks: Task[] = TASKS): Analysis[] {
  return tasks.filter((t) => t.kind === "仕込み").map((t) => {
    const mine = records.filter((r) => r.taskId === t.id);
    const made = mine.filter(isMade).sort((a, b) => (after(a, b) ? 1 : -1));
    // 在庫確認で「仕込む」と決めた回も、減るのが早かった回として「切れた」と同じに数える
    const outs = mine.filter((r) => isOut(r) || isPlan(r));
    const cycles: Cycle[] = [];
    for (let i = 1; i < made.length; i++) {
      const a = made[i - 1];
      const b = made[i];
      const actualDays = dayDiff(a.date, b.date);
      if (actualDays <= 0) continue;
      // 決まった曜日に仕込んだ回は次の決まった曜日まで。切れて臨時に仕込んだ回は、ふだんの間隔で見る
      const plannedDays =
        t.weekday?.length && !isScheduledDay(t, a.date)
          ? Math.round(t.intervalDays)
          : dayDiff(a.date, plannedNext(t, a.date));
      const earlyDays = plannedDays - actualDays;
      const wentOut = outs.some((o) => after(o, a) && !after(o, b));
      const expired = t.shelfLifeDays !== undefined && actualDays >= t.shelfLifeDays;
      const trigger: Cycle["trigger"] = wentOut
        ? "切れた"
        : expired
          ? "期限"
          : earlyDays > 0
            ? "早め"
            : earlyDays < 0
              ? "遅れ"
              : "予定どおり";
      cycles.push({ from: a.date, to: b.date, actualDays, plannedDays, earlyDays, trigger, qty: a.qty ?? batchOn(t, a.date) });
    }
    const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((p, q) => p + q, 0) / xs.length) : null);
    const outCycles = cycles.filter((c) => c.trigger === "切れた" && c.qty);
    const perDay = avg(outCycles.map((c) => c.qty! / c.actualDays));
    const plannedDays = round1(
      cycles.length ? cycles.reduce((p, c) => p + c.plannedDays, 0) / cycles.length : t.intervalDays,
    );
    const outCount = cycles.filter((c) => c.trigger === "切れた").length;
    const expireCount = cycles.filter((c) => c.trigger === "期限").length;
    const avgEarlyDays = avg(cycles.map((c) => c.earlyDays));

    let advice = "記録が2回以上たまると、予定とのずれが出ます";
    if (cycles.length) {
      const recent = cycles.slice(-4);
      const recentOut = recent.filter((c) => c.trigger === "切れた").length;
      if (recentOut >= 2 && perDay && t.batch) {
        // 切れるペースから、予定の日数もつ量を出す
        const per = t.batchByWeekday
          ? Object.entries(t.batchByWeekday)
              .map(([wd, n]) => {
                const from = [...Array(7)].map((_, i) => addDays(today, i)).find((d) => weekdayOf(d) === Number(wd))!;
                const days = dayDiff(from, plannedNext(t, from));
                return `${WD[Number(wd)]}曜 ${n}→${Math.ceil(perDay * days)}`;
              })
              .join("・")
          : `${t.batch}→${Math.ceil(perDay * plannedDays)}`;
        advice = `直近${recent.length}回のうち${recentOut}回、予定より前に切れています。1回の量を ${per}${t.unit ?? ""} にすると予定どおり回る計算です`;
      } else if (recent.filter((c) => c.trigger === "期限").length >= 2) {
        advice = "期限で作り直す回が続いています。余っているなら1回の量を減らせます";
      } else if ((avgEarlyDays ?? 0) >= 1) {
        advice = `平均${avgEarlyDays}日早く仕込んでいます。切れたときは「切れた」を押すと、原因（量が足りない）が分析に出ます`;
      } else {
        advice = "ほぼ予定どおりに回っています";
      }
    }
    return {
      id: t.id,
      name: t.name,
      unit: t.unit,
      plannedDays,
      cycles: cycles.slice(-10).reverse(),
      avgActualDays: avg(cycles.map((c) => c.actualDays)),
      avgEarlyDays,
      outCount,
      expireCount,
      perDay,
      advice,
    };
  });
}
