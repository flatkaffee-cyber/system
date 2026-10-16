// freee から直接読む口。取り込み（sync.ts）と、比べるための ?source=freee が使う。
import { FREEE_COMPANY_ID, fetchAll, freeeGet } from "@/lib/freee";
import { isMissingPeriodError, periodOf } from "@/lib/keiri/period";
import type { FreeeDeal, FreeeJournal, FreeeTransfer } from "@/lib/keiri/types";
import type {
  AccountItem,
  FreeeSource,
  Partner,
  TrialBsPartnerResponse,
  TrialPlResponse,
  Walletable,
  WalletTxnRaw,
} from "./source";

const Q = { company_id: FREEE_COMPANY_ID };
const RETRY_WAIT_MS = [2000, 4000, 8000];

export function makeLiveSource(opts: { onRequest?: () => void } = {}): FreeeSource {
  // freee の回数の上限（429）に当たったら、少し待って3回までやり直す
  async function get<T>(path: string, query: Record<string, string>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      opts.onRequest?.();
      try {
        return await freeeGet<T>(path, query);
      } catch (e) {
        const wait = RETRY_WAIT_MS[attempt];
        if (wait === undefined || !(e instanceof Error) || !e.message.includes("(429)")) throw e;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  const all = <T>(path: string, key: string, query: Record<string, string>) =>
    fetchAll<T>(path, key, { ...Q, ...query }, get);
  // 会計期間が無い（1期目より前など）は null
  async function report<T>(path: string, query: Record<string, string>): Promise<T | null> {
    try {
      return await get<T>(path, { ...Q, ...query });
    } catch (e) {
      if (e instanceof Error && isMissingPeriodError(e.message)) return null;
      throw e;
    }
  }
  const walletables = async () => (await get<{ walletables: Walletable[] }>("/api/1/walletables", Q)).walletables ?? [];

  return {
    kind: "freee",
    walletables,
    accountItems: async () => (await get<{ account_items: AccountItem[] }>("/api/1/account_items", Q)).account_items ?? [],
    partners: async () => (await get<{ partners: Partner[] }>("/api/1/partners", { ...Q, limit: "3000" })).partners ?? [],
    async walletTxns(r, f = {}) {
      const ws = (await walletables()).filter(
        (w) => (f.walletableId == null || w.id === f.walletableId) && (!f.walletableTypes || f.walletableTypes.includes(w.type)),
      );
      const per = await Promise.all(
        ws.map(async (w) => {
          const txns = await all<WalletTxnRaw>("/api/1/wallet_txns", "wallet_txns", {
            walletable_type: w.type,
            walletable_id: String(w.id),
            start_date: r.from,
            end_date: r.to,
          });
          return txns.map((t) => ({ ...t, walletable_type: t.walletable_type ?? w.type }));
        }),
      );
      return per.flat().filter((t) => f.status == null || t.status === f.status);
    },
    deals: (r) => all<FreeeDeal>("/api/1/deals", "deals", { start_issue_date: r.from, end_issue_date: r.to }),
    manualJournals: (r) =>
      all<FreeeJournal>("/api/1/manual_journals", "manual_journals", { start_issue_date: r.from, end_issue_date: r.to }),
    transfers: (r) => all<FreeeTransfer>("/api/1/transfers", "transfers", { start_date: r.from, end_date: r.to }),
    trialPl(month) {
      const p = periodOf(month);
      return report<TrialPlResponse>("/api/1/reports/trial_pl", {
        fiscal_year: String(p.fiscalYear),
        start_month: String(p.calendarMonth),
        end_month: String(p.calendarMonth),
        account_item_display_type: "account_item",
      });
    },
    trialBsPartner: (fiscalYear) =>
      report<TrialBsPartnerResponse>("/api/1/reports/trial_bs", {
        fiscal_year: String(fiscalYear),
        breakdown_display_type: "partner",
        account_item_display_type: "account_item",
      }),
  };
}

export const liveSource: FreeeSource = makeLiveSource();
