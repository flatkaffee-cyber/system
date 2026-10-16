// freee のデータの取り出し口。freee から直接読む口（live.ts）と、Supabase の写しから読む口（read.ts）を同じ形にする。
// 返す形は freee の API の応答と同じ。照合と損益の計算（lib/keiri/*）はどちらの口でも同じに動く。
import type { FreeeDeal, FreeeJournal, FreeeTransfer, TrialPlBalance, WalletTxn } from "@/lib/keiri/types";
import { chooseSource } from "./choose";
import { isDbReady } from "./db";
import { liveSource } from "./live";
import { dbHasData, dbSource } from "./read";

export type Range = { from: string; to: string };
export type TxnFilter = { walletableId?: number; walletableTypes?: string[]; status?: number };
export type Walletable = { id: number; name: string; type: string };
export type AccountItem = {
  id: number;
  name: string;
  walletable_id?: number | null;
  account_category?: string;
  categories?: string[];
};
export type Partner = { id: number; name: string };
export type WalletTxnRaw = WalletTxn & { walletable_type: string };
export type TrialPlResponse = { trial_pl: { balances: TrialPlBalance[] }; up_to_date: boolean };
export type TrialBsBalance = {
  account_item_id?: number;
  closing_balance?: number;
  partners?: { id: number; name: string; closing_balance: number }[];
};
export type TrialBsPartnerResponse = { trial_bs: { balances: TrialBsBalance[] }; up_to_date: boolean };

export interface FreeeSource {
  kind: "db" | "freee";
  walletables(): Promise<Walletable[]>;
  accountItems(): Promise<AccountItem[]>;
  partners(): Promise<Partner[]>;
  walletTxns(r: Range, f?: TxnFilter): Promise<WalletTxnRaw[]>;
  deals(r: Range): Promise<FreeeDeal[]>;
  manualJournals(r: Range): Promise<FreeeJournal[]>;
  transfers(r: Range): Promise<FreeeTransfer[]>;
  /** null = freee にその会計期間が無い／写しにまだ無い */
  trialPl(month: string): Promise<TrialPlResponse | null>;
  trialBsPartner(fiscalYear: number): Promise<TrialBsPartnerResponse | null>;
}

/** 画面を写しから出すスイッチ（Vercel の環境変数 KEIRI_READ_FROM=db）が入っていて、Supabase が使える */
export function readsFromDb(): boolean {
  return (process.env.KEIRI_READ_FROM ?? "").trim() === "db" && isDbReady();
}

/**
 * 読む口を選ぶ。?source=freee|db で口を指定できる（比べるため）。
 * ふだんは、スイッチが入っていて写しに1回でも取り込めていれば写し、そうでなければ freee から直接
 */
export async function pickSource(req?: { nextUrl: URL }): Promise<FreeeSource> {
  const param = req?.nextUrl.searchParams.get("source") ?? null;
  const readFromDb = readsFromDb();
  const hasData = !param && readFromDb ? await dbHasData() : false;
  return chooseSource({ param, readFromDb, hasData, dbReady: isDbReady() }) === "db" ? dbSource : liveSource;
}
