// 月次の行を「店舗（regular）・イベント（event）・臨時（irregular）」に振り分ける決まりと、4つの数字。
// 月次レポート（lib/monthlyReport.ts）と経理画面の月次（/api/keiri/monthly）が同じものを使い、2つの画面の数字をそろえる。
// 純粋な関数。実行時に他のファイルを import しない（テストから .ts 付きで読むため）。画面（クライアント）からも使う。

export type Bucket = "regular" | "event" | "irregular";
export type Scope = "all" | "store" | "event";

/** 経理画面の切り替え → 表で残す区分（全体は絞らない） */
export const SCOPE_BUCKET: Record<Scope, Bucket | null> = { all: null, store: "regular", event: "event" };
export const isScope = (s: string): s is Scope => s === "all" || s === "store" || s === "event";

/** 損益の科目の区分。これ以外（資産・負債・純資産）は行にしない */
export const PL_CATEGORIES = ["売上高", "売上原価", "販売管理費", "営業外収益", "営業外費用", "特別利益", "特別損失", "法人税等"];
/** 人件費として扱う科目 */
export const LABOR_ACCOUNTS = ["役員報酬", "給料手当", "雑給", "賞与", "法定福利費", "外注費"];
/** 一度きりの収入として扱う科目 */
export const IRREGULAR_ACCOUNTS = ["雑収入", "受取利息", "雑損失", "固定資産売却益", "固定資産売却損"];
/** 領収書のこのタグが付いた行は一度きりの支出として扱う */
export const IRREGULAR_TAGS = [
  "物販",
  "内装・家具",
  "店舗備品",
  "開業準備",
  "クラファン",
  // 開店まもない時期に揃えている道具類。毎月買うものではない
  "調理器具",
  "工具・作業用品",
  "塗装材料",
];

export type Detail = { entry_side?: "credit" | "debit"; account_item_id: number; amount: number; description?: string | null };
export type AccountLike = { name: string; account_category?: string; categories?: string[] };

export type Line = {
  key: string; // 付け替えの保存に使う一意キー
  source: "deal" | "journal" | "estimate" | "event-adjust";
  sourceId: number | string;
  date: string;
  account: string;
  /** 利益への影響。収入はプラス、費用はマイナス */
  amount: number;
  description: string;
  tags: string[];
  auto: Bucket;
  bucket: Bucket;
  reason: string;
};

/** 前受金の動き。amount は＋が入金、−が売上への振り替え（取り崩し）・返金 */
export type OffBookEntry = { date: string; label: string; amount: number };
export type Scopes = { store: number; event: number; irregular: number; total: number };

export const isPL = (a?: AccountLike): boolean =>
  !!a && (PL_CATEGORIES.includes(a.account_category ?? "") || (a.categories ?? []).some((c) => PL_CATEGORIES.includes(c)));

/** 1行の自動の振り分け。上の決まりほど強い */
export function classify(x: {
  account: string;
  description: string;
  tags: string[];
  date: string;
  eventDays: ReadonlySet<string>;
  fromAdvance: boolean;
}): { auto: Bucket; reason: string } {
  if (x.fromAdvance) return { auto: "irregular", reason: "前受金からの振り替え" };
  if (IRREGULAR_ACCOUNTS.includes(x.account)) return { auto: "irregular", reason: `${x.account}は毎月のものではない` };
  if (/返金|出金取消|キャッシュバック/.test(x.description)) return { auto: "irregular", reason: "返金・取消" };
  const hit = x.tags.filter((t) => IRREGULAR_TAGS.includes(t));
  if (hit.length > 0) return { auto: "irregular", reason: `タグ「${hit.join("・")}」` };
  const onEventDay = x.eventDays.has(x.date);
  if (/DJ|イベント|ライブ/.test(x.description) || (onEventDay && ["支払報酬", "賃借料"].includes(x.account))) {
    return { auto: "event", reason: onEventDay ? "イベント日の費用・売上" : "摘要にイベント" };
  }
  // イベント日の Square 連携の売上は、イベント分を月次レポートで後からまとめて移すので、ここでは通常のまま
  return { auto: "regular", reason: "" };
}

/**
 * freee の取引・振替伝票から、損益の行と前受金の動きを作る。
 * 前受金の借方がある取引・振替伝票（売上への振り替え・返金）の損益の行は臨時にする。
 * 入金の月に臨時に入れた前受金を、振り替えの月にもう一度数えないため
 */
export function buildLines(x: {
  deals: { id: number; issue_date: string; type?: "income" | "expense"; details: Detail[] }[];
  journals: { id: number; issue_date: string; details: Detail[] }[];
  accounts: Map<number, AccountLike>;
  tagOf: (sourceId: number, amount: number) => string[];
  overrides: Record<string, Bucket>;
  eventDays: ReadonlySet<string>;
}): { lines: Line[]; offBook: OffBookEntry[] } {
  const lines: Line[] = [];
  const offBook: OffBookEntry[] = [];
  const isAdvance = (d: Detail) => x.accounts.get(d.account_item_id)?.name === "前受金";

  const push = (
    source: "deal" | "journal",
    sourceId: number,
    idx: number,
    date: string,
    d: Detail,
    side: "credit" | "debit",
    fromAdvance: boolean,
  ) => {
    const acc = x.accounts.get(d.account_item_id);
    const name = acc?.name ?? String(d.account_item_id);
    if (!isPL(acc)) {
      if (name === "前受金") offBook.push({ date, label: d.description || "前受金", amount: side === "credit" ? d.amount : -d.amount });
      return;
    }
    const description = d.description ?? "";
    const tags = x.tagOf(sourceId, d.amount);
    const { auto, reason } = classify({ account: name, description, tags, date, eventDays: x.eventDays, fromAdvance });
    const key = `${source}:${sourceId}:${idx}`;
    lines.push({
      key,
      source,
      sourceId,
      date,
      account: name,
      amount: side === "credit" ? d.amount : -d.amount,
      description,
      tags,
      auto,
      bucket: x.overrides[key] ?? auto,
      reason,
    });
  };

  for (const deal of x.deals) {
    const sideOf = (d: Detail) => d.entry_side ?? (deal.type === "income" ? "credit" : "debit");
    const adv = deal.details.some((d) => isAdvance(d) && sideOf(d) === "debit");
    deal.details.forEach((d, i) => push("deal", deal.id, i, deal.issue_date, d, sideOf(d), adv));
  }
  for (const j of x.journals) {
    const sideOf = (d: Detail) => d.entry_side ?? "debit";
    const adv = j.details.some((d) => isAdvance(d) && sideOf(d) === "debit");
    j.details.forEach((d, i) => push("journal", j.id, i, j.issue_date, d, sideOf(d), adv));
  }
  return { lines, offBook };
}

const round = (n: number) => Math.round(n) || 0; // −0 を 0 に

/** 4つの数字。臨時には前受金の動きを足す。全体 = 店舗 + イベント + 臨時 */
export function scopeTotals(lines: { bucket: Bucket; amount: number }[], offBook: { amount: number }[]): Scopes {
  const sum = (b: Bucket) => lines.filter((l) => l.bucket === b).reduce((s, l) => s + l.amount, 0);
  const store = round(sum("regular"));
  const event = round(sum("event"));
  const irregular = round(sum("irregular") + offBook.reduce((s, o) => s + o.amount, 0));
  return { store, event, irregular, total: store + event + irregular };
}

/** 取引・振替伝票の区分。金額（絶対値）のいちばん大きい行の区分。損益の行が無ければ null */
export function sourceBucket(lines: { bucket: Bucket; amount: number }[]): Bucket | null {
  let best: { bucket: Bucket; amount: number } | null = null;
  for (const l of lines) if (!best || Math.abs(l.amount) > Math.abs(best.amount)) best = l;
  return best?.bucket ?? null;
}

type RowRef = { key: string; dealId?: number; journalId?: number };
const sourceKey = (row: RowRef) =>
  row.dealId != null ? `deal:${row.dealId}` : row.journalId != null ? `journal:${row.journalId}` : null;

/**
 * 表（経理で見る）の行の区分。損益のある取引・振替伝票に結びつく行はその区分（付け替えは取引の明細に効いている）。
 * 損益の無い取引（工事・備品・借入と返済・貸し借り）は臨時、結びつかない行（Square の入金・口座振替）は店舗。
 * この2つは行ごとの付け替え（row:{行の key}）が勝つ
 */
export function rowBucket(row: RowRef, sources: Map<string, Bucket>, overrides: Record<string, Bucket>): Bucket {
  const k = sourceKey(row);
  if (k && sources.has(k)) return sources.get(k)!;
  return overrides[`row:${row.key}`] ?? (k ? "irregular" : "regular");
}

/** 行の札を付け替えるときに保存する鍵。損益のある取引は月次レポートと同じ明細の鍵（全部の明細）、それ以外は行の鍵 */
export function overrideKeysForRow(row: RowRef, sources: Map<string, Bucket>, detailCounts: Map<string, number>): string[] {
  const k = sourceKey(row);
  const n = k && sources.has(k) ? detailCounts.get(k) ?? 0 : 0;
  return n > 0 ? Array.from({ length: n }, (_, i) => `${k}:${i}`) : [`row:${row.key}`];
}
