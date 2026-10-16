import { NextRequest, NextResponse } from "next/server";
import { isConnected } from "@/lib/freee";
import { pickSource } from "@/lib/freeeMirror/source";
import { getReceipts } from "@/lib/receipts";
import { getPendingExpenses } from "@/lib/pending-expenses";
import { isMissingPeriodError, isMonth, jstMonth, periodOf, shiftMonth } from "@/lib/keiri/period";
import { buildPl } from "@/lib/keiri/pl";
import { buildCash, summarize } from "@/lib/keiri/cashflow";
import { attachReceipts } from "@/lib/keiri/linkReceipts";
import type { CashView, PlView } from "@/lib/keiri/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export type KeiriMonthlyResponse = {
  month: string;
  prev: string;
  next: string | null;
  view: "cash" | "pl";
  future: boolean;
  noData?: boolean; // freeeにその会計期間が無い（1期目より前など）
  source: "db" | "freee"; // db = Supabase の写しから、freee = freee から直接
  cash?: CashView;
  pl?: PlView;
  warnings: string[];
};

type AccountItem = { id: number; name: string };

const namesOf = (items: AccountItem[]) => new Map(items.map((a) => [a.id, a.name]));

// GET /api/keiri/monthly?month=2026-10&view=cash|pl
//   経理画面の月次ページ用。cash = お金の出入り（日付順）、pl = 損益計算書
export async function GET(req: NextRequest) {
  const src = await pickSource(req);
  // 写しから出すときは、freee との接続が切れていても最後に取り込んだ数字を出す
  if (src.kind === "freee" && !(await isConnected())) {
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
    source: src.kind,
    warnings: [],
  };
  if (res.future) return NextResponse.json(res);

  const p = periodOf(month);
  try {
    if (view === "pl") {
      // 1期目より前の月などは freee が「会計期間がありません」を返す（null）→ データが無い月として扱う
      const trial = await src.trialPl(month);
      if (!trial) return NextResponse.json({ ...res, noData: true });
      const range = { from: p.from, to: p.to };
      const [deals, journals, items] = await Promise.all([src.deals(range), src.manualJournals(range), src.accountItems()]);
      res.pl = buildPl({ balances: trial.trial_pl.balances, upToDate: trial.up_to_date, deals, journals, accountNames: namesOf(items) });
      if (!trial.up_to_date) res.warnings.push("freeeの集計が更新中です。少し待って開き直すと最新になります。");
      return NextResponse.json(res);
    }

    const walletables = await src.walletables();
    const bank = walletables.find((w) => w.type === "bank_account");
    const cash = walletables.find((w) => w.name === "現金");
    const sqOther = walletables.find((w) => w.name === "Squareその他");
    if (!bank || !cash || !sqOther) {
      return NextResponse.json({ error: "freeeの口座（普通預金・現金・Squareその他）が見つかりません" }, { status: 500 });
    }
    // 前の月に計上して今月払った取引も拾うため、計上日は3か月前から取る
    const dealFrom = `${shiftMonth(month, -3)}-01`;
    const [walletTxns, deals, journals, transfers, partners, items] = await Promise.all([
      src.walletTxns({ from: p.from, to: p.to }, { walletableId: bank.id }),
      src.deals({ from: dealFrom, to: p.to }),
      src.manualJournals({ from: p.from, to: p.to }),
      src.transfers({ from: p.from, to: p.to }),
      src.partners(),
      src.accountItems(),
    ]);
    const built = buildCash({
      month: { from: p.from, to: p.to },
      bankWalletableId: bank.id,
      cashWalletableId: cash.id,
      squareOtherWalletableId: sqOther.id,
      bankAccountItemId: items.find((a) => a.walletable_id === bank.id)?.id,
      walletTxns,
      deals,
      journals,
      transfers,
      accountNames: namesOf(items),
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
