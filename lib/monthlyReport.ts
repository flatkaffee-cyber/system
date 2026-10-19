// 月次レポート。freeeに入った実際の数字を「通常営業の実力」と「臨時・不定期」に分けて見せる。
//
// 分け方の考え方:
//   - 通常営業 … 毎月くり返す売上と経費。ここの利益が店の実力
//   - イベント … イベント日の売上と、DJ代・機材代などイベントのために払ったもの
//   - 臨時     … キャッシュバックや返金、クラファンの返礼品、椅子や備品など一度きりのもの
// 自動で振り分けたうえで、画面から1行ずつ付け替えられる（付け替えはKVに保存）。

import { pickSource, type FreeeSource } from "@/lib/freeeMirror/source";
import { getReceipts, receiptLines, type SavedReceipt } from "@/lib/receipts";
import { EXCLUDE_WINDOWS } from "@/lib/salesEvents";
import { getShifts, toMin } from "@/lib/shift";

import {
  buildLines,
  LABOR_ACCOUNTS,
  scopeTotals,
  sourceBucket,
  type Bucket,
  type Line,
} from "@/lib/keiri/buckets";
import type { FreeeDeal, FreeeJournal } from "@/lib/keiri/types";
export type { Bucket, Line } from "@/lib/keiri/buckets";

const OVERRIDE_KEY = "monthly:overrides";
const SETTINGS_KEY = "monthly:settings";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

/**
 * freeeにまだ載っていないが、毎月かかっているもの。
 * その月に同じ科目の実績が1行も無いときだけ「見込み」として足す
 * （社保は翌月払い、業務委託は後払いなので、月によっては帳簿に出てこないため）。
 */
export type Estimate = {
  id: string;
  label: string;
  amount: number;
  /** この科目の実績がその月にあれば見込みは足さない */
  account: string;
  from: string; // YYYY-MM
  to?: string; // YYYY-MM
  labor: boolean;
};

export type Settings = {
  wage: number; // アルバイト時給
  nightRate: number; // 深夜割増（22時〜）
  estimates: Estimate[];
};

export const DEFAULT_SETTINGS: Settings = {
  wage: 1200,
  nightRate: 0.25,
  estimates: [
    {
      id: "shaho",
      label: "社会保険料（会社負担・3人分）",
      amount: 32800,
      account: "法定福利費",
      from: "2026-09",
      labor: true,
    },
    {
      id: "kuninaka",
      label: "業務委託料（國仲）",
      amount: 52056,
      account: "外注費",
      from: "2026-09",
      labor: true,
    },
  ],
};

export async function getSettings(): Promise<Settings> {
  const store = await kv();
  if (!store) return DEFAULT_SETTINGS;
  const saved = await store.get<Partial<Settings>>(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const next = { ...(await getSettings()), ...patch };
  await store.set(SETTINGS_KEY, next);
  return next;
}

export async function getOverrides(): Promise<Record<string, Bucket>> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<Record<string, Bucket>>(OVERRIDE_KEY)) ?? {};
}

export async function setOverride(key: string, bucket: Bucket | null): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const cur = await getOverrides();
  if (bucket) cur[key] = bucket;
  else delete cur[key];
  await store.set(OVERRIDE_KEY, cur);
}

// ── freeeから取る ─────────────────────────────

type AccountItem = { id: number; name: string; account_category?: string; categories?: string[] };

type Detail = {
  entry_side?: "credit" | "debit";
  account_item_id: number;
  amount: number;
  description?: string;
};

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}`, days: last };
}

/** 領収書の行タグを、freee側の行に金額で突き合わせて引く */
function receiptTagger(receipts: SavedReceipt[]) {
  const byId = new Map<number, SavedReceipt>();
  for (const r of receipts) if (r.registered?.journalId) byId.set(r.registered.journalId, r);
  const used = new Map<number, Set<number>>();
  return (sourceId: number, amount: number): string[] => {
    const r = byId.get(sourceId);
    if (!r) return [];
    const lines = receiptLines(r);
    const u = used.get(sourceId) ?? new Set<number>();
    const i = lines.findIndex((l, idx) => !u.has(idx) && Math.abs(l.amount || 0) === Math.abs(amount));
    if (i < 0) return [...new Set(lines.flatMap((l) => l.tags ?? []))];
    u.add(i);
    used.set(sourceId, u);
    return lines[i].tags ?? [];
  };
}

export type MonthlyData = Awaited<ReturnType<typeof buildMonthly>>;

/**
 * @param squareEvents イベント時間帯のSquare売上（analyticsの除外分）。freeeのSquare連携売上から差し引いてイベントへ移す
 * @param src freee のデータの読む口。省略時は Supabase の写し（まだ無ければ freee から直接）
 */
export async function buildMonthly(
  month: string,
  squareEvents: { label: string; sales: number }[],
  src?: FreeeSource,
) {
  const { from, to, days } = monthRange(month);
  const s = src ?? (await pickSource());
  const [accountItems, deals, journals, receipts, overrides, settings] = await Promise.all([
    s.accountItems() as Promise<AccountItem[]>,
    // 中身は freee の応答そのもの。ここでは摘要（description）を null のない形で受ける
    s.deals({ from, to }) as unknown as Promise<{ id: number; issue_date: string; type: "income" | "expense"; details: Detail[] }[]>,
    s.manualJournals({ from, to }) as unknown as Promise<{ id: number; issue_date: string; details: Detail[] }[]>,
    getReceipts(),
    getOverrides(),
    getSettings(),
  ]);

  const accounts = new Map<number, AccountItem>();
  for (const a of accountItems) accounts.set(a.id, a);

  const eventDays = new Set(
    EXCLUDE_WINDOWS.filter((w) => w.reason === "イベント" && w.date.startsWith(month)).map((w) => w.date),
  );
  // 損益の行と、前受金の動き（クラファンなど。入金は＋、売上への振り替え・返金は−）
  const { lines, offBook } = buildLines({ deals, journals, accounts, tagOf: receiptTagger(receipts), overrides, eventDays });

  // Squareのイベント時間帯の売上を、通常営業の売上からイベントへ移す
  for (const ev of squareEvents) {
    if (!ev.sales) continue;
    const w = EXCLUDE_WINDOWS.find((x) => x.label === ev.label);
    const date = w?.date ?? from;
    lines.push({
      key: `event-adjust:${ev.label}:out`,
      source: "event-adjust",
      sourceId: ev.label,
      date,
      account: "売上高",
      amount: -ev.sales,
      description: `${ev.label}のSquare売上（通常営業から外す）`,
      tags: [],
      auto: "regular",
      bucket: "regular",
      reason: "イベント分を通常営業から差し引き",
    });
    lines.push({
      key: `event-adjust:${ev.label}:in`,
      source: "event-adjust",
      sourceId: ev.label,
      date,
      account: "売上高",
      amount: ev.sales,
      description: `${ev.label}のSquare売上`,
      tags: [],
      auto: "event",
      bucket: "event",
      reason: "イベント日のレジ売上",
    });
  }

  // 帳簿にまだ無い毎月の費用（見込み）
  for (const e of settings.estimates) {
    if (month < e.from || (e.to && month > e.to)) continue;
    if (lines.some((l) => l.account === e.account)) continue;
    lines.push({
      key: `estimate:${e.id}`,
      source: "estimate",
      sourceId: e.id,
      date: to,
      account: e.account,
      amount: -e.amount,
      description: `${e.label}（見込み・freee未計上）`,
      tags: [],
      auto: "regular",
      bucket: "regular",
      reason: "毎月かかるがまだ帳簿に無い",
    });
  }

  // ── 集計 ──
  const sum = (ls: Line[]) => ls.reduce((n, l) => n + l.amount, 0);
  const reg = lines.filter((l) => l.bucket === "regular");
  const salesLines = reg.filter((l) => l.account === "売上高");
  const salesBy: Record<string, number> = {};
  for (const l of salesLines) {
    const k = /【売上】|Square/.test(l.description)
      ? "店内（Square）"
      : /Uber/i.test(l.description)
        ? "Uber Eats"
        : "その他";
    salesBy[k] = (salesBy[k] ?? 0) + l.amount;
  }
  const sales = sum(salesLines);
  const cogsLines = reg.filter((l) => l.account === "仕入高");
  const cogs = -sum(cogsLines);
  const laborLines = reg.filter((l) => LABOR_ACCOUNTS.includes(l.account));
  const labor = -sum(laborLines);
  const otherLines = reg.filter(
    (l) => l.account !== "売上高" && l.account !== "仕入高" && !LABOR_ACCOUNTS.includes(l.account),
  );
  const expenseBy: Record<string, number> = {};
  for (const l of otherLines) expenseBy[l.account] = (expenseBy[l.account] ?? 0) - l.amount;
  const otherExpense = -sum(otherLines);
  const beforeLabor = sales - cogs - otherExpense;
  const regularProfit = beforeLabor - labor;

  // 店舗・イベント・臨時・全体の4つの数字。経理画面の月次と同じ計算（lib/keiri/buckets.ts）
  const scopes = scopeTotals(lines, offBook);

  // ── アルバイト試算の材料 ──
  const shifts = (await getShifts()).filter((s) => s.date.startsWith(month));
  let dayMin = 0;
  let nightMin = 0;
  const byStaff: Record<string, { day: number; night: number }> = {};
  for (const s of shifts) {
    const a = toMin(s.start);
    let b = toMin(s.end);
    if (a === null || b === null) continue;
    if (b <= a) b += 24 * 60;
    // 深夜割増は22時〜翌5時
    const night = Math.max(0, Math.min(b, 29 * 60) - Math.max(a, 22 * 60)) + (a < 5 * 60 ? Math.max(0, Math.min(b, 5 * 60) - a) : 0);
    const day = b - a - night;
    dayMin += day;
    nightMin += night;
    const st = (byStaff[s.staff] = byStaff[s.staff] ?? { day: 0, night: 0 });
    st.day += day;
    st.night += night;
  }
  const shiftDays = new Set(shifts.map((s) => s.date)).size;

  const r = (n: number) => Math.round(n);
  return {
    month,
    period: { from, to, days },
    settings,
    eventLabels: EXCLUDE_WINDOWS.filter((w) => w.reason === "イベント" && w.date.startsWith(month)).map(
      (w) => `${w.date.slice(5)} ${w.label}`,
    ),
    regular: {
      sales: r(sales),
      salesBy: Object.entries(salesBy).map(([label, amount]) => ({ label, amount: r(amount) })),
      cogs: r(cogs),
      cogsRate: sales > 0 ? Math.round((cogs / sales) * 1000) / 10 : 0,
      expenses: Object.entries(expenseBy)
        .map(([account, amount]) => ({ account, amount: r(amount) }))
        .sort((a, b) => b.amount - a.amount),
      otherExpense: r(otherExpense),
      beforeLabor: r(beforeLabor),
      labor: laborLines
        .map((l) => ({ label: l.source === "estimate" ? l.description : l.account, amount: r(-l.amount), estimate: l.source === "estimate" }))
        .reduce<{ label: string; amount: number; estimate: boolean }[]>((acc, x) => {
          const hit = acc.find((y) => y.label === x.label);
          if (hit) hit.amount += x.amount;
          else acc.push({ ...x });
          return acc;
        }, []),
      laborTotal: r(labor),
      profit: r(regularProfit),
    },
    event: { total: scopes.event },
    // 臨時には前受金の動き（クラファンの入金など）も入る
    irregular: { total: scopes.irregular },
    final: scopes.total,
    scopes,
    offBook,
    lines: lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    shift: {
      days: shiftDays,
      dayHours: Math.round((dayMin / 60) * 10) / 10,
      nightHours: Math.round((nightMin / 60) * 10) / 10,
      byStaff: Object.entries(byStaff).map(([staff, v]) => ({
        staff,
        day: Math.round((v.day / 60) * 10) / 10,
        night: Math.round((v.night / 60) * 10) / 10,
      })),
    },
  };
}

/**
 * 取引・振替伝票ごとの区分（経理画面の表の行の札に使う）。月次レポートと同じ振り分け・付け替え・領収書のタグで、
 * 月で区切らずに数える（前の月に計上して今月払った取引も、その取引の月の振り分けになる）
 */
export async function bucketsForSources(
  deals: FreeeDeal[],
  journals: FreeeJournal[],
  src: FreeeSource,
): Promise<{ sources: Map<string, Bucket>; detailCounts: Map<string, number> }> {
  const [accountItems, receipts, overrides] = await Promise.all([
    src.accountItems() as Promise<AccountItem[]>,
    getReceipts(),
    getOverrides(),
  ]);
  const accounts = new Map(accountItems.map((a) => [a.id, a]));
  const eventDays = new Set(EXCLUDE_WINDOWS.filter((w) => w.reason === "イベント").map((w) => w.date));
  const { lines } = buildLines({ deals, journals, accounts, tagOf: receiptTagger(receipts), overrides, eventDays });
  const bySource = new Map<string, Line[]>();
  for (const l of lines) {
    const k = `${l.source}:${l.sourceId}`;
    bySource.set(k, [...(bySource.get(k) ?? []), l]);
  }
  const sources = new Map<string, Bucket>();
  for (const [k, ls] of bySource) {
    const b = sourceBucket(ls);
    if (b) sources.set(k, b);
  }
  const detailCounts = new Map<string, number>([
    ...deals.map((d): [string, number] => [`deal:${d.id}`, d.details.length]),
    ...journals.map((j): [string, number] => [`journal:${j.id}`, j.details.length]),
  ]);
  return { sources, detailCounts };
}
