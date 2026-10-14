import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, isConnected } from "@/lib/freee";
import { fetchAll } from "@/lib/monthlyReport";
import { getReceipts } from "@/lib/receipts";
import { getPendingExpenses } from "@/lib/pending-expenses";
import { isMonth, jstMonth, periodOf, shiftMonth } from "@/lib/keiri/period";
import { buildPl } from "@/lib/keiri/pl";
import { buildCash, summarize } from "@/lib/keiri/cashflow";
import { attachReceipts } from "@/lib/keiri/linkReceipts";
import type {
  CashView,
  FreeeDeal,
  FreeeJournal,
  FreeeTransfer,
  PlView,
  TrialPlBalance,
  WalletTxn,
} from "@/lib/keiri/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export type KeiriMonthlyResponse = {
  month: string;
  prev: string;
  next: string | null;
  view: "cash" | "pl";
  future: boolean;
  cash?: CashView;
  pl?: PlView;
  warnings: string[];
};

type Walletable = { id: number; name: string; type: string };
const Q = { company_id: FREEE_COMPANY_ID };

async function accountNames(): Promise<Map<number, string>> {
  const r = await freeeGet<{ account_items: { id: number; name: string }[] }>("/api/1/account_items", Q);
  return new Map((r.account_items ?? []).map((a) => [a.id, a.name]));
}

// GET /api/keiri/monthly?month=2026-10&view=cash|pl
//   経理画面の月次ページ用。cash = お金の出入り（日付順）、pl = 損益計算書
export async function GET(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続です" }, { status: 400 });
  }
  const thisMonth = jstMonth();
  const raw = req.nextUrl.searchParams.get("month") ?? "";
  const month = isMonth(raw) ? raw : thisMonth;
  const view = req.nextUrl.searchParams.get("view") === "pl" ? "pl" : "cash";
  const res: KeiriMonthlyResponse = {
    month,
    prev: shiftMonth(month, -1),
    next: month < thisMonth ? shiftMonth(month, 1) : null,
    view,
    future: month > thisMonth,
    warnings: [],
  };
  if (res.future) return NextResponse.json(res);

  const p = periodOf(month);
  try {
    if (view === "pl") {
      const [trial, deals, journals, names] = await Promise.all([
        freeeGet<{ trial_pl: { balances: TrialPlBalance[] }; up_to_date: boolean }>("/api/1/reports/trial_pl", {
          ...Q,
          fiscal_year: String(p.fiscalYear),
          start_month: String(p.calendarMonth),
          end_month: String(p.calendarMonth),
          account_item_display_type: "account_item",
        }),
        fetchAll<FreeeDeal>("/api/1/deals", "deals", { ...Q, start_issue_date: p.from, end_issue_date: p.to }),
        fetchAll<FreeeJournal>("/api/1/manual_journals", "manual_journals", { ...Q, start_issue_date: p.from, end_issue_date: p.to }),
        accountNames(),
      ]);
      res.pl = buildPl({ balances: trial.trial_pl.balances, upToDate: trial.up_to_date, deals, journals, accountNames: names });
      if (!trial.up_to_date) res.warnings.push("freeeの集計が更新中です。少し待って開き直すと最新になります。");
      return NextResponse.json(res);
    }

    const { walletables } = await freeeGet<{ walletables: Walletable[] }>("/api/1/walletables", Q);
    const bank = walletables.find((w) => w.type === "bank_account");
    const cash = walletables.find((w) => w.name === "現金");
    const sqOther = walletables.find((w) => w.name === "Squareその他");
    if (!bank || !cash || !sqOther) {
      return NextResponse.json({ error: "freeeの口座（普通預金・現金・Squareその他）が見つかりません" }, { status: 500 });
    }
    // 前の月に計上して今月払った取引も拾うため、計上日は3か月前から取る
    const dealFrom = `${shiftMonth(month, -3)}-01`;
    const [walletTxns, deals, journals, transfers, partners, names] = await Promise.all([
      fetchAll<WalletTxn>("/api/1/wallet_txns", "wallet_txns", {
        ...Q,
        walletable_type: "bank_account",
        walletable_id: String(bank.id),
        start_date: p.from,
        end_date: p.to,
      }),
      fetchAll<FreeeDeal>("/api/1/deals", "deals", { ...Q, start_issue_date: dealFrom, end_issue_date: p.to }),
      fetchAll<FreeeJournal>("/api/1/manual_journals", "manual_journals", { ...Q, start_issue_date: p.from, end_issue_date: p.to }),
      fetchAll<FreeeTransfer>("/api/1/transfers", "transfers", { ...Q, start_date: p.from, end_date: p.to }),
      fetchAll<{ id: number; name: string }>("/api/1/partners", "partners", Q),
      accountNames(),
    ]);
    const built = buildCash({
      month: { from: p.from, to: p.to },
      bankWalletableId: bank.id,
      cashWalletableId: cash.id,
      squareOtherWalletableId: sqOther.id,
      walletTxns,
      deals,
      journals,
      transfers,
      accountNames: names,
      partnerNames: new Map(partners.map((x) => [x.id, x.name])),
    });

    let outflows = built.outflows;
    try {
      const [receipts, pending] = await Promise.all([getReceipts(), getPendingExpenses()]);
      outflows = attachReceipts(outflows, receipts, pending);
    } catch {
      res.warnings.push("領収書を読み込めませんでした。領収書の欄は空のまま表示しています。");
    }
    res.cash = { inflows: built.inflows, outflows, totals: summarize(built.inflows, outflows) };
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "読み込みに失敗しました" }, { status: 500 });
  }
}
