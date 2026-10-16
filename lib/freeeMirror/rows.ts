// freee の応答 → Supabase の表の行。それと、Supabase から1000行ずつ全部読むためのページ分け。
import type { FreeeDeal, FreeeJournal, FreeeTransfer } from "../keiri/types";
import type { WalletTxnRaw } from "./source";

type Base = { company_id: number; id: number; raw: unknown; synced_at: string };

export function walletTxnRow(raw: WalletTxnRaw, companyId: number, syncedAt: string) {
  return {
    company_id: companyId,
    id: raw.id,
    walletable_type: raw.walletable_type,
    walletable_id: raw.walletable_id,
    date: raw.date,
    status: raw.status,
    raw,
    synced_at: syncedAt,
  };
}

export function dealRow(raw: FreeeDeal, companyId: number, syncedAt: string): Base & { issue_date: string } {
  return { company_id: companyId, id: raw.id, issue_date: raw.issue_date, raw, synced_at: syncedAt };
}

export function journalRow(raw: FreeeJournal, companyId: number, syncedAt: string): Base & { issue_date: string } {
  return { company_id: companyId, id: raw.id, issue_date: raw.issue_date, raw, synced_at: syncedAt };
}

export function transferRow(raw: FreeeTransfer, companyId: number, syncedAt: string): Base & { date: string } {
  return { company_id: companyId, id: raw.id, date: raw.date, raw, synced_at: syncedAt };
}

/** Supabase は1回で1000行までしか返さない。短いページが来るまで読む（from・to は両端を含む） */
export async function readAll<T>(fetchPage: (from: number, to: number) => Promise<T[]>, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    out.push(...page);
    if (page.length < pageSize) return out;
  }
}
