// 経理の月次ページで使う型。freeeのAPIの形（必要な項目だけ）と、画面に渡す行の形。

export type TrialPlBalance = {
  account_item_name?: string;
  account_category_name?: string;
  total_line?: boolean;
  hierarchy_level: number;
  opening_balance: number;
  closing_balance: number;
};
export type FreeeDetail = {
  account_item_id: number;
  amount: number;
  description?: string | null;
  entry_side: "debit" | "credit";
};
export type FreeePayment = {
  date: string;
  from_walletable_type: string;
  from_walletable_id: number;
  amount: number;
};
export type FreeeDeal = {
  id: number;
  issue_date: string;
  type: "income" | "expense";
  partner_id?: number | null;
  status?: "settled" | "unsettled";
  amount?: number;
  details: FreeeDetail[];
  payments?: FreeePayment[];
};
export type FreeeJournal = { id: number; issue_date: string; details: FreeeDetail[] };
export type WalletTxn = {
  id: number;
  date: string;
  amount: number;
  description: string;
  entry_side: "income" | "expense";
  status: number; // 1 = 未処理, 2 = 処理済み
  walletable_id: number;
};
export type FreeeTransfer = {
  id: number;
  date: string;
  amount: number;
  from_walletable_id: number;
  to_walletable_id: number;
};

export type PlEntry = { date: string; description: string; amount: number; sourceType: "deal" | "journal"; sourceId: number };
export type PlAccount = { name: string; amount: number; entries: PlEntry[] };
export type PlLine = {
  key: string;
  label: string;
  amount: number;
  kind: "item" | "subtotal" | "total";
  accounts?: PlAccount[];
};
export type PlView = {
  lines: PlLine[];
  officerPay: number;
  laborCost: number;
  pretax: number;
  tax: { amount: number; estimated: boolean };
  netIncome: number;
  upToDate: boolean;
};

export type PayTag = "card" | "bank" | "cash" | "tatekae";
export type ReceiptStatus = "attached" | "amazon" | "missing" | "missing-recorded" | "n/a";
/** freeeでの状態。done = 処理済み、todo = 明細が未処理、waiting = 未決済の取引に当たったが消込前 */
export type RowStatus = "done" | "todo" | "waiting";
export type CashRow = {
  key: string;
  date: string;
  amount: number;
  title: string; // 明細の文字・店名・振込先など
  account: string; // 科目（複数は「・」）。無ければ ""
  description: string; // 摘要。口座振替などは「現金へ移動」のような種類。無ければ ""
  kind: "sales" | "other" | "expense" | "move"; // move = 口座⇄現金の移動（合計に入れない）
  tag?: PayTag; // 出金だけ
  status: RowStatus;
  partner?: string;
  dealId?: number;
  journalId?: number;
  walletTxnId?: number;
  receipt?: { id: string; vendor: string };
  amazonOrderId?: string;
  receiptStatus?: ReceiptStatus;
};
export type CashTotals = { in: number; out: number; net: number; missingReceipts: number; unprocessed: number };
export type CashView = { inflows: CashRow[]; outflows: CashRow[]; totals: CashTotals };
export type CashInput = {
  month: { from: string; to: string };
  bankWalletableId: number;
  cashWalletableId: number;
  squareOtherWalletableId: number;
  bankAccountItemId?: number; // 普通預金の勘定科目ID（account_items の walletable_id が銀行口座のもの）
  walletTxns: WalletTxn[]; // 普通預金のその月の明細
  deals: FreeeDeal[]; // 支払日がその月にある取引（計上日が前の月の取引も含めて渡す）
  journals: FreeeJournal[]; // その月の振替伝票
  transfers: FreeeTransfer[]; // その月の口座振替
  accountNames: Map<number, string>;
  partnerNames: Map<number, string>;
};
