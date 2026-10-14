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
