// 仕入れサイクル分析。
// 領収書の履歴（いつ・何を買ったか）から、品目ごとの購入間隔を自動で割り出し、
// 「そろそろ切れる」時期を推定する。手で頻度を登録しなくても、買った実績が
// そのまま記録になる。

import { getReceipts, receiptLines, type SavedReceipt } from "@/lib/receipts";

// 商品ではない行（税額調整・送料・値引きなど）。仕入れ周期の対象から外す。
const NOISE_PATTERNS = [
  /消費税/, /税額/, /内税/, /外税/,
  /送料/, /配送料/, /手数料/,
  /値引/, /割引/, /ポイント/, /調整/,
  /^合計/, /^小計/, /^お?釣/,
];

export function isNoiseItem(name: string): boolean {
  const s = String(name || "").trim();
  if (!s) return true;
  return NOISE_PATTERNS.some((p) => p.test(s));
}

// 正規化は品目の学習側と同じものを使う（ずれると同じ商品が別扱いになる）
import { normalizeItemName } from "@/lib/itemName";
export { normalizeItemName };

export type PurchaseStat = {
  name: string; // 正規化後の品目名
  displayName: string; // 直近の実際の表記
  category: string;
  vendor: string; // 直近の購入先
  count: number; // 購入回数
  dates: string[]; // 購入日（昇順）
  lastDate: string;
  lastAmount: number;
  totalAmount: number;
  avgIntervalDays: number | null; // 購入間隔の中央値（購入2回以上のときだけ）
  daysSinceLast: number;
  /** 次に買うべき推定日。間隔が分かる品目のみ */
  nextDueDate: string | null;
  /** 推定日まであと何日（マイナスは超過） */
  daysUntilDue: number | null;
  status: "overdue" | "soon" | "ok" | "unknown";
  /** 周期の信頼度。開業準備中にまとめ買いしただけの物を「定期購入」と誤認しないための指標 */
  reliable: boolean;
  spanDays: number; // 初回購入から前回購入までの期間
  /** 月ごとの金額（"2026-10" → 円）。仕入れのページの「毎月の金額」に出す */
  months: Record<string, number>;
};

const DAY = 86_400_000;
const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) =>
  Math.round((new Date(a).getTime() - new Date(b).getTime()) / DAY);

/**
 * 領収書から品目ごとの購入サイクルを集計する。
 * minCount=1 なら1回しか買っていないものも含める（間隔は不明扱い）。
 */
export function analyzePurchases(
  receipts: SavedReceipt[],
  opts: { minCount?: number; soonDays?: number } = {},
): PurchaseStat[] {
  const minCount = opts.minCount ?? 1;
  const soonDays = opts.soonDays ?? 3;
  const today = jstToday();

  type Acc = {
    displayName: string;
    category: string;
    vendor: string;
    dates: string[];
    amounts: number[];
    lastDate: string;
    months: Record<string, number>;
  };
  const map = new Map<string, Acc>();

  for (const r of receipts) {
    if (!r.date) continue;
    for (const l of receiptLines(r)) {
      if (isNoiseItem(l.name)) continue;
      const key = normalizeItemName(l.name);
      if (!key || key.length < 2) continue;
      const cur = map.get(key);
      if (!cur) {
        map.set(key, {
          displayName: l.name,
          category: l.category || "不明",
          vendor: r.vendor || "",
          dates: [r.date],
          amounts: [l.amount || 0],
          lastDate: r.date,
          months: { [r.date.slice(0, 7)]: l.amount || 0 },
        });
      } else {
        cur.dates.push(r.date);
        cur.amounts.push(l.amount || 0);
        const mon = r.date.slice(0, 7);
        cur.months[mon] = (cur.months[mon] ?? 0) + (l.amount || 0);
        if (r.date > cur.lastDate) {
          cur.lastDate = r.date;
          cur.displayName = l.name;
          cur.vendor = r.vendor || cur.vendor;
          cur.category = l.category || cur.category;
        }
      }
    }
  }

  const out: PurchaseStat[] = [];
  for (const [name, a] of map) {
    if (a.dates.length < minCount) continue;
    const dates = [...a.dates].sort();
    // 同日の重複購入は1回として扱う（1回の買い物で複数行に分かれることがあるため）
    const uniqDates = [...new Set(dates)];

    // 間隔は中央値を使う（開業準備の連日購入のような外れ値に引っ張られないため）
    let avgInterval: number | null = null;
    const intervals: number[] = [];
    for (let i = 1; i < uniqDates.length; i++) {
      intervals.push(dayDiff(uniqDates[i], uniqDates[i - 1]));
    }
    if (intervals.length > 0) {
      const sorted = [...intervals].sort((x, y) => x - y);
      const mid = Math.floor(sorted.length / 2);
      avgInterval =
        sorted.length % 2 === 1
          ? sorted[mid]
          : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
    }

    const spanDays = uniqDates.length >= 2 ? dayDiff(uniqDates[uniqDates.length - 1], uniqDates[0]) : 0;
    // 開業準備中に数日で何度も買った備品を「定期購入」と誤認しないための条件。
    // 3回以上買っていて、初回から前回まで2週間以上にわたっていれば周期とみなす。
    const reliable = uniqDates.length >= 3 && spanDays >= 14;

    const daysSinceLast = dayDiff(today, a.lastDate);
    let nextDueDate: string | null = null;
    let daysUntilDue: number | null = null;
    let status: PurchaseStat["status"] = "unknown";

    if (avgInterval && avgInterval > 0) {
      const due = new Date(new Date(a.lastDate).getTime() + avgInterval * DAY);
      nextDueDate = due.toISOString().slice(0, 10);
      daysUntilDue = dayDiff(nextDueDate, today);
      status = daysUntilDue < 0 ? "overdue" : daysUntilDue <= soonDays ? "soon" : "ok";
    }

    out.push({
      name,
      displayName: a.displayName,
      category: a.category,
      vendor: a.vendor,
      count: uniqDates.length,
      dates: uniqDates,
      lastDate: a.lastDate,
      lastAmount: a.amounts[a.amounts.length - 1] || 0,
      totalAmount: a.amounts.reduce((s, x) => s + x, 0),
      avgIntervalDays: avgInterval,
      daysSinceLast,
      nextDueDate,
      daysUntilDue,
      status,
      reliable,
      spanDays,
      months: a.months,
    });
  }

  // 信頼できる周期のものを優先し、その中で急ぎ順 → 購入回数が多い順
  const rank = { overdue: 0, soon: 1, ok: 2, unknown: 3 };
  out.sort((x, y) => {
    if (x.reliable !== y.reliable) return x.reliable ? -1 : 1;
    if (rank[x.status] !== rank[y.status]) return rank[x.status] - rank[y.status];
    if (x.daysUntilDue !== null && y.daysUntilDue !== null) return x.daysUntilDue - y.daysUntilDue;
    return y.count - x.count;
  });
  return out;
}

export async function getPurchaseStats(
  opts: { minCount?: number; soonDays?: number } = {},
): Promise<PurchaseStat[]> {
  const receipts = await getReceipts();
  return analyzePurchases(receipts, opts);
}

// ── 仕入れ先ごとの一覧 ───────────────────────────
// 領収書の購入先（店）ごとに、何をいつ・いくらで買っているかをまとめる。
// 金額は領収書の合計（送料・値引きも含めた実際に払った額）、品目は商品の行だけ。

export type VendorItem = {
  name: string;
  count: number; // 買った日数
  lastDate: string;
  lastAmount: number;
  totalAmount: number;
};

export type VendorStat = {
  vendor: string;
  visits: number; // 領収書の枚数
  totalAmount: number;
  firstDate: string;
  lastDate: string;
  daysSinceLast: number;
  items: VendorItem[];
};

/** 表記ゆれ（全角・半角のスペース、前後の空白）をそろえた店名 */
export const vendorKey = (v: string) => (v || "").replace(/[\s　]+/g, " ").trim() || "（店名なし）";

export function analyzeVendors(receipts: SavedReceipt[]): VendorStat[] {
  const today = jstToday();
  type Acc = { vendor: string; visits: number; total: number; first: string; last: string; items: Map<string, VendorItem & { days: Set<string> }> };
  const map = new Map<string, Acc>();
  for (const r of receipts) {
    if (!r.date) continue;
    const key = vendorKey(r.vendor);
    const v = map.get(key) ?? { vendor: key, visits: 0, total: 0, first: r.date, last: r.date, items: new Map() };
    v.visits += 1;
    v.total += r.total || 0;
    if (r.date < v.first) v.first = r.date;
    if (r.date > v.last) v.last = r.date;
    for (const l of receiptLines(r)) {
      if (isNoiseItem(l.name)) continue;
      const k = normalizeItemName(l.name) || l.name;
      const it = v.items.get(k) ?? { name: l.name, count: 0, lastDate: "", lastAmount: 0, totalAmount: 0, days: new Set<string>() };
      it.days.add(r.date);
      it.count = it.days.size;
      it.totalAmount += l.amount || 0;
      if (r.date >= it.lastDate) {
        it.lastDate = r.date;
        it.lastAmount = l.amount || 0;
        it.name = l.name;
      }
      v.items.set(k, it);
    }
    map.set(key, v);
  }
  return [...map.values()]
    .map((v) => ({
      vendor: v.vendor,
      visits: v.visits,
      totalAmount: v.total,
      firstDate: v.first,
      lastDate: v.last,
      daysSinceLast: dayDiff(today, v.last),
      items: [...v.items.values()]
        .map(({ days: _days, ...it }) => it)
        .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.totalAmount - a.totalAmount),
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

export async function getVendorStats(): Promise<VendorStat[]> {
  return analyzeVendors(await getReceipts());
}

/* ── 仕入れに出すものだけにする（2026-11-14 坂本さん）──────────────
 * 仕入れのページは、材料と消耗品を「そろそろ買う」「毎月いくら」で見るためのもの。
 * 交通費・保険料などの科目と、開業準備で一回きり買った物（木材・金具・レジ袋など）は出さない。
 * 判断がつかないものは、画面の「外す」で坂本さんが外せる（KV shiire:hidden）。 */

/** 仕入れとして見る科目 */
export const STOCK_CATEGORIES = new Set(["仕入高", "消耗品費"]);

/** 仕入れではない物（開業準備の資材・道具・お店でもらう袋・印刷など） */
export const NOT_STOCK =
  /木材|カフェ板|集成材|リノベ柱|ナット|フランジ|ボルト|ビス|額金具|ヤスリ|レバーハンドル|はんぺん|マスキングテープ|塗装|レジ袋|レジブクロ|袋代|プリント代|部門0|タイマー|スキレット|ココット|ピッチャー|タンブラー|トング|ホゾンヨウキ|保存容器|ラック|速達/;

export type ExcludeReason = "category" | "keyword" | "hidden";

export function excludeReason(s: Pick<PurchaseStat, "name" | "displayName" | "category">, hidden: Set<string>): ExcludeReason | null {
  if (hidden.has(s.name)) return "hidden";
  if (!STOCK_CATEGORIES.has(s.category)) return "category";
  if (NOT_STOCK.test(s.displayName) || NOT_STOCK.test(s.name)) return "keyword";
  return null;
}

async function shiireKv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}
const HIDDEN_KEY = "shiire:hidden";

/** 画面で「外す」を押した品目（正規化した品目名） */
export async function getShiireHidden(): Promise<string[]> {
  const s = await shiireKv();
  if (!s) return [];
  return (await s.get<string[]>(HIDDEN_KEY)) ?? [];
}

export async function setShiireHidden(name: string, hide: boolean): Promise<string[]> {
  const s = await shiireKv();
  if (!s) throw new Error("KV未設定");
  const cur = new Set((await s.get<string[]>(HIDDEN_KEY)) ?? []);
  if (hide) cur.add(name);
  else cur.delete(name);
  const next = [...cur];
  await s.set(HIDDEN_KEY, next);
  return next;
}

/* ── 仕入れ表（2026-11-18 坂本さん）──────────────────────────
 * 仕入れのページを開いたら、買っている物の一覧（仕入れ表）を出す。
 * ・品目名は「牛乳」「ツナ缶」のように短く。領収書の「豊富牛乳公社 サロベツ 4コ×218」のような書き方は出さない
 *   → 在庫確認の品目につながる物はその名前にまとめ（銘柄違いの牛乳も1行）、つながらない物は数や単価を取った名前にする
 * ・食材と備品に分ける（在庫確認の分類、無ければ科目: 仕入高=食材・消耗品費=備品）
 * ・買う先は、在庫確認の品目の発注先（buyId）か、仕入れ表（lib/inventory）の同じ名前の物から出す */

export type SheetRow = {
  name: string;
  kind: "食材" | "備品";
  /** まとめた領収書の品目名（正規化したもの）。「外す」で全部外すため */
  keys: string[];
  /** 直近の領収書の書き方（行を開いたときだけ出す） */
  lastLine: string;
  lastDate: string;
  lastAmount: number;
  daysSinceLast: number;
  vendor: string;
  count: number;
  avgIntervalDays: number | null;
  totalAmount: number;
  months: Record<string, number>;
  buy: { supplier: string; url: string; price: number } | null;
};

/** 領収書の品名から、数・単価・入り数を取って短くする */
export function cleanItemName(raw: string): string {
  let s = raw.normalize("NFKC").trim();
  s = s.replace(/[（(][^）)]*[\d@×x][^）)]*[）)]/g, ""); // (2個×単858) など
  s = s.replace(/\s*[\d]+\s*(コ|個|本|袋|枚|点|缶|P|p|パック)\s*[×x].*$/u, "");
  s = s.replace(/\s*@\s*[\d,]+.*$/u, "");
  s = s.replace(/\s*[×x]\s*(単)?[\d,]+.*$/u, "");
  s = s.replace(/\s+[\d]+\s*(コ|個|本|袋|枚|点|缶)$/u, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s || raw;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round(((a[m - 1] + a[m]) / 2) * 10) / 10;
};

export async function getPurchaseSheet(): Promise<{ rows: SheetRow[]; hidden: string[] }> {
  const [stats, hiddenList] = await Promise.all([getPurchaseStats({ minCount: 1 }), getShiireHidden()]);
  const { getItems, isPurchaseOf } = await import("@/lib/stockroom");
  const { getInventoryItems } = await import("@/lib/inventory");
  const [items, inventory] = await Promise.all([getItems(), getInventoryItems()]);
  const hidden = new Set(hiddenList);
  const byInvId = new Map(inventory.map((i) => [i.id, i]));
  const sq = (s: string) => s.normalize("NFKC").replace(/[\s　・]/g, "");
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

  type Acc = { row: SheetRow; dates: Set<string> };
  const map = new Map<string, Acc>();
  for (const s of stats) {
    if (excludeReason(s, hidden)) continue;
    const item = items.find((i) => !i.madeInHouse && (isPurchaseOf(i, s.displayName) || isPurchaseOf(i, s.name)));
    const name = item ? item.name.replace(/[（(][^）)]*[）)]/g, "").trim() || item.name : cleanItemName(s.displayName);
    const kind: SheetRow["kind"] = item ? (item.group === "消耗品・包材" ? "備品" : "食材") : s.category === "消耗品費" ? "備品" : "食材";
    const key = `${kind}:${name}`;
    let acc = map.get(key);
    if (!acc) {
      const inv =
        (item?.buyId !== undefined ? byInvId.get(item.buyId) : undefined) ??
        inventory.find((v) => sq(v.name) === sq(name) || sq(v.name).includes(sq(name)) || sq(name).includes(sq(v.name)));
      acc = {
        dates: new Set(),
        row: {
          name, kind, keys: [], lastLine: s.displayName, lastDate: "", lastAmount: 0, daysSinceLast: 0,
          vendor: s.vendor, count: 0, avgIntervalDays: null, totalAmount: 0, months: {},
          buy: inv && (inv.url || inv.supplier) ? { supplier: inv.supplier, url: inv.url, price: inv.price } : null,
        },
      };
      map.set(key, acc);
    }
    const r = acc.row;
    r.keys.push(s.name);
    for (const d of s.dates) acc.dates.add(d);
    r.totalAmount += s.totalAmount;
    for (const [m, v] of Object.entries(s.months ?? {})) r.months[m] = (r.months[m] ?? 0) + v;
    if (s.lastDate > r.lastDate) {
      r.lastDate = s.lastDate;
      r.lastAmount = s.lastAmount;
      r.lastLine = s.displayName;
      r.vendor = s.vendor || r.vendor;
    }
  }
  const rows: SheetRow[] = [];
  for (const { row, dates } of map.values()) {
    const ds = [...dates].sort();
    // 一回きりの買い物は出さない（2日以上に分けて買った物だけ）
    if (ds.length < 2) continue;
    const gaps: number[] = [];
    for (let i = 1; i < ds.length; i++) gaps.push(Math.round((Date.parse(ds[i]) - Date.parse(ds[i - 1])) / 86_400_000));
    row.count = ds.length;
    row.avgIntervalDays = median(gaps);
    row.daysSinceLast = Math.round((Date.parse(today) - Date.parse(row.lastDate)) / 86_400_000);
    rows.push(row);
  }
  rows.sort((a, b) => (a.kind === b.kind ? b.lastDate.localeCompare(a.lastDate) : a.kind === "食材" ? -1 : 1));
  return { rows, hidden: hiddenList };
}

/** 仕入れ表の1行を外す／戻す（まとめた品目名を全部） */
export async function setSheetRowHidden(keys: string[], hide: boolean): Promise<string[]> {
  let cur: string[] = [];
  for (const k of keys) cur = await setShiireHidden(k, hide);
  return cur;
}
