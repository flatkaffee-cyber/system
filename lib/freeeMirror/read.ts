// Supabase の写しから読む口と、取り込みの状態。返す形は freee の応答と同じ（raw をそのまま返す）。
import { fiscalRange } from "@/lib/keiri/period";
import type { FreeeDeal, FreeeJournal, FreeeTransfer } from "@/lib/keiri/types";
import { COMPANY_ID, db, isDbReady } from "./db";
import type { SyncState } from "./health";
import { readAll } from "./rows";
import type {
  AccountItem,
  FreeeSource,
  Partner,
  TrialBsPartnerResponse,
  TrialPlResponse,
  Walletable,
  WalletTxnRaw,
} from "./source";

type Result = PromiseLike<{ data: unknown; error: { message: string } | null }>;

async function raws<T>(label: string, q: Result): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(`Supabase（${label}）の読み込みに失敗しました: ${error.message}`);
  return ((data ?? []) as { raw: T }[]).map((r) => r.raw);
}

async function one<T>(label: string, q: Result): Promise<T | null> {
  return (await raws<T>(label, q))[0] ?? null;
}

const master = async <T>(kind: string) =>
  (await one<T[]>(kind, db().from("freee_masters").select("raw").eq("company_id", COMPANY_ID).eq("kind", kind).limit(1))) ?? [];

const report = <T>(kind: string, period: string) =>
  one<T>(
    `${kind} ${period}`,
    db().from("freee_reports").select("raw").eq("company_id", COMPANY_ID).eq("kind", kind).eq("period", period).limit(1),
  );

/** 日付の列で範囲を絞った表を、日付→id の順に全部読む */
const byDate = <T>(table: string, column: "date" | "issue_date", from: string, to: string) =>
  readAll<T>((a, b) =>
    raws<T>(
      table,
      db().from(table).select("raw").eq("company_id", COMPANY_ID).gte(column, from).lte(column, to)
        .order(column).order("id").range(a, b),
    ),
  );

export const dbSource: FreeeSource = {
  kind: "db",
  walletables: () => master<Walletable>("walletables"),
  accountItems: () => master<AccountItem>("account_items"),
  partners: () => master<Partner>("partners"),
  walletTxns: (r, f = {}) =>
    readAll<WalletTxnRaw>((a, b) => {
      let q = db().from("freee_wallet_txns").select("raw").eq("company_id", COMPANY_ID).gte("date", r.from).lte("date", r.to);
      if (f.walletableId != null) q = q.eq("walletable_id", f.walletableId);
      if (f.walletableTypes) q = q.in("walletable_type", f.walletableTypes);
      if (f.status != null) q = q.eq("status", f.status);
      return raws<WalletTxnRaw>("明細", q.order("date").order("id").range(a, b));
    }),
  deals: (r) => byDate<FreeeDeal>("freee_deals", "issue_date", r.from, r.to),
  manualJournals: (r) => byDate<FreeeJournal>("freee_manual_journals", "issue_date", r.from, r.to),
  transfers: (r) => byDate<FreeeTransfer>("freee_transfers", "date", r.from, r.to),
  trialPl: (month) => report<TrialPlResponse>("trial_pl", month),
  trialBsPartner: (fiscalYear) => report<TrialBsPartnerResponse>("trial_bs_partner", `fy${fiscalYear}`),
};

export type MirrorState = SyncState & { lastNightlyDate: string | null; monthHashes: Record<string, string> };

type StateRow = {
  last_success_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  alerted_at: string | null;
  last_nightly_date: string | null;
  month_hashes: Record<string, string> | null;
};

/** 取り込みの状態。まだ1回も動いていなければ全部 null */
export async function getMirrorState(): Promise<MirrorState> {
  const { data, error } = await db().from("freee_sync_state").select("*").eq("company_id", COMPANY_ID).maybeSingle();
  if (error) throw new Error(`Supabase（取り込みの状態）の読み込みに失敗しました: ${error.message}`);
  const s = data as StateRow | null;
  return {
    lastSuccessAt: s?.last_success_at ?? null,
    lastError: s?.last_error ?? null,
    lastErrorAt: s?.last_error_at ?? null,
    alertedAt: s?.alerted_at ?? null,
    lastNightlyDate: s?.last_nightly_date ?? null,
    monthHashes: s?.month_hashes ?? {},
  };
}

/** Supabase が使えて、1回でも取り込めている */
export async function dbHasData(): Promise<boolean> {
  if (!isDbReady()) return false;
  try {
    return !!(await getMirrorState()).lastSuccessAt;
  } catch {
    return false;
  }
}

/** その年度の損益の試算表のうち、保存済みの月と、freee が集計中だった月 */
export async function trialPlStatus(fiscalYear: number): Promise<{ stored: string[]; notUpToDate: string[] }> {
  const r = fiscalRange(fiscalYear);
  const { data, error } = await db()
    .from("freee_reports")
    .select("period, up_to_date")
    .eq("company_id", COMPANY_ID)
    .eq("kind", "trial_pl")
    .gte("period", r.from.slice(0, 7))
    .lte("period", r.to.slice(0, 7));
  if (error) throw new Error(`Supabase（試算表の一覧）の読み込みに失敗しました: ${error.message}`);
  const rows = (data ?? []) as { period: string; up_to_date: boolean }[];
  return { stored: rows.map((x) => x.period), notUpToDate: rows.filter((x) => !x.up_to_date).map((x) => x.period) };
}
