import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCash, cleanBankText } from "./cashflow.ts";
import type { CashInput, FreeeDeal, WalletTxn } from "./types.ts";

const BANK = 100;
const CASH = 200;
const SQ_OTHER = 300;

const names = new Map<number, string>([
  [1, "売上高"],
  [2, "売掛金"],
  [3, "車両費"],
  [4, "旅費交通費"],
  [5, "役員貸付金"],
  [6, "消耗品費"],
  [7, "現金"],
  [8, "役員借入金"],
  [9, "普通預金"],
]);

const base = (over: Partial<CashInput>): CashInput => ({
  month: { from: "2026-10-01", to: "2026-10-31" },
  bankWalletableId: BANK,
  cashWalletableId: CASH,
  squareOtherWalletableId: SQ_OTHER,
  walletTxns: [],
  deals: [],
  journals: [],
  transfers: [],
  accountNames: names,
  partnerNames: new Map([[50, "町田創"]]),
  ...over,
});

const txn = (id: number, date: string, amount: number, description: string, side: "income" | "expense", status = 2): WalletTxn => ({
  id, date, amount, description, entry_side: side, status, walletable_id: BANK,
});

const expenseDeal = (id: number, issue: string, payDate: string, amount: number, account: number, desc: string, from = BANK): FreeeDeal => ({
  id,
  issue_date: issue,
  type: "expense",
  details: [{ account_item_id: account, amount, description: desc, entry_side: "debit" }],
  payments: [{ date: payDate, from_walletable_type: from === BANK ? "bank_account" : "wallet", from_walletable_id: from, amount }],
});

test("カード明細の店名を読みやすくする", () => {
  assert.equal(
    cleanBankText("Visaデビット利用 ｱﾎﾟﾛｽﾃ-ｼﾖﾝ 承認番号：598472 TID：386280386997987"),
    "ｱﾎﾟﾛｽﾃ-ｼﾖﾝ",
  );
  assert.equal(cleanBankText("振込 ミズホ マチダ　シヨウ"), "振込 ミズホ マチダ シヨウ");
});

test("同じ日・同じ金額のカード払い2件を別々の取引に割り当てる", () => {
  const v = buildCash(base({
    walletTxns: [
      txn(1, "2026-10-11", 5000, "Visaデビット利用 ｱﾎﾟﾛｽﾃ-ｼﾖﾝ 承認番号：1", "expense"),
      txn(2, "2026-10-11", 5000, "Visaデビット利用 ｱﾎﾟﾛｽﾃ-ｼﾖﾝ 承認番号：2", "expense"),
    ],
    deals: [
      expenseDeal(11, "2026-10-11", "2026-10-11", 5000, 3, "ガソリン1"),
      expenseDeal(12, "2026-10-11", "2026-10-11", 5000, 3, "ガソリン2"),
    ],
  }));
  assert.deepEqual(v.outflows.map((r) => r.dealId).sort(), [11, 12]);
  assert.ok(v.outflows.every((r) => r.tag === "card" && r.kind === "expense"));
});

test("前の月に計上して今月払った取引も今月の出金に出る", () => {
  const v = buildCash(base({
    walletTxns: [txn(3, "2026-10-09", 40775, "振込 ユウチヨ スエヨシ ユメノ", "expense")],
    deals: [expenseDeal(13, "2026-08-24", "2026-10-09", 40775, 4, "航空券")],
  }));
  assert.equal(v.outflows.length, 1);
  assert.equal(v.outflows[0].dealId, 13);
  assert.equal(v.outflows[0].tag, "bank");
  assert.match(v.outflows[0].detail, /旅費交通費/);
});

test("ATMの出金と現金の預け入れは合計に入れない", () => {
  const v = buildCash(base({
    walletTxns: [
      txn(4, "2026-10-12", 9000, "ATM セブン銀行", "expense"),
      txn(5, "2026-10-20", 50000, "現金預入", "income"),
    ],
    transfers: [
      { id: 1, date: "2026-10-12", amount: 9000, from_walletable_id: BANK, to_walletable_id: CASH },
      { id: 2, date: "2026-10-20", amount: 50000, from_walletable_id: CASH, to_walletable_id: BANK },
    ],
  }));
  assert.equal(v.outflows[0].kind, "move");
  assert.equal(v.inflows[0].kind, "move");
  assert.equal(v.totals.out, 0);
  assert.equal(v.totals.in, 0);
});

test("入金は売上金とその他に分ける", () => {
  const v = buildCash(base({
    walletTxns: [
      txn(6, "2026-10-09", 84609, "振込 スクエア（カ", "income"),
      txn(7, "2026-10-02", 140669, "振込 PAYPAY", "income"),
      txn(8, "2026-10-12", 50000, "振込 マチダ シヨウ", "income"),
    ],
    deals: [
      { id: 20, issue_date: "2026-10-09", type: "income", details: [{ account_item_id: 2, amount: 84609, entry_side: "credit" }], payments: [{ date: "2026-10-09", from_walletable_type: "bank_account", from_walletable_id: BANK, amount: 84609 }] },
      { id: 21, issue_date: "2026-10-12", type: "income", partner_id: 50, details: [{ account_item_id: 5, amount: 50000, description: "返済", entry_side: "credit" }], payments: [{ date: "2026-10-12", from_walletable_type: "bank_account", from_walletable_id: BANK, amount: 50000 }] },
    ],
    transfers: [{ id: 3, date: "2026-10-02", amount: 140669, from_walletable_id: SQ_OTHER, to_walletable_id: BANK }],
  }));
  const kinds = Object.fromEntries(v.inflows.map((r) => [r.amount, r.kind]));
  assert.deepEqual(kinds, { 84609: "sales", 140669: "sales", 50000: "other" });
  assert.equal(v.inflows.find((r) => r.amount === 50000)?.partner, "町田創");
  assert.equal(v.totals.in, 84609 + 140669 + 50000);
});

test("現金売上は日ごとにまとめる", () => {
  const sq = (id: number, date: string, cash: number): FreeeDeal => ({
    id, issue_date: date, type: "income",
    details: [{ account_item_id: 1, amount: cash + 1000, entry_side: "credit" }],
    payments: [
      { date, from_walletable_type: "wallet", from_walletable_id: CASH, amount: cash },
      { date, from_walletable_type: "wallet", from_walletable_id: SQ_OTHER, amount: 1000 },
    ],
  });
  const v = buildCash(base({ deals: [sq(30, "2026-10-03", 3000), sq(31, "2026-10-03", 2000), sq(32, "2026-10-04", 500)] }));
  assert.deepEqual(
    v.inflows.map((r) => [r.date, r.amount, r.kind, r.title]),
    [["2026-10-03", 5000, "sales", "現金売上（レジ）"], ["2026-10-04", 500, "sales", "現金売上（レジ）"]],
  );
});

test("現金払い・立替の振替伝票は出金に出す。普通預金への預け入れは除く", () => {
  const v = buildCash(base({
    journals: [
      { id: 40, issue_date: "2026-10-11", details: [
        { account_item_id: 6, amount: 2378, description: "発泡箱", entry_side: "debit" },
        { account_item_id: 7, amount: 2378, description: "CAINZ", entry_side: "credit" },
      ] },
      { id: 41, issue_date: "2026-10-15", details: [
        { account_item_id: 6, amount: 980, description: "紙皿", entry_side: "debit" },
        { account_item_id: 8, amount: 980, description: "平和堂", entry_side: "credit" },
      ] },
      { id: 42, issue_date: "2026-10-20", details: [
        { account_item_id: 9, amount: 50000, entry_side: "debit" },
        { account_item_id: 7, amount: 50000, entry_side: "credit" },
      ] },
    ],
  }));
  assert.deepEqual(v.outflows.map((r) => [r.journalId, r.tag, r.amount]), [[40, "cash", 2378], [41, "tatekae", 980]]);
});

test("現金で払った取引は現金タグ", () => {
  const v = buildCash(base({ deals: [expenseDeal(50, "2026-10-05", "2026-10-05", 1200, 6, "ガムテープ", CASH)] }));
  assert.equal(v.outflows[0].tag, "cash");
  assert.equal(v.outflows[0].dealId, 50);
});

test("未処理の明細は未処理として数える", () => {
  const v = buildCash(base({
    walletTxns: [txn(9, "2026-10-13", 17057, "Visaデビット利用 AMAZON CO JP 承認番号：1", "expense", 1)],
  }));
  assert.equal(v.outflows[0].processed, false);
  assert.equal(v.outflows[0].tag, "card");
  assert.equal(v.totals.unprocessed, 1);
  assert.equal(v.totals.out, 17057);
});

test("データがない月は空で返す", () => {
  const v = buildCash(base({}));
  assert.deepEqual(v, { inflows: [], outflows: [], totals: { in: 0, out: 0, net: 0, missingReceipts: 0, unprocessed: 0 } });
});

test("月の外の明細・支払いは入れない", () => {
  const v = buildCash(base({
    walletTxns: [txn(10, "2026-09-30", 100, "振込 X", "expense")],
    deals: [expenseDeal(60, "2026-09-30", "2026-09-30", 100, 6, "前月")],
  }));
  assert.equal(v.outflows.length, 0);
});

test("出金・入金は日付順", () => {
  const v = buildCash(base({
    walletTxns: [
      txn(11, "2026-10-20", 300, "振込 B", "expense", 1),
      txn(12, "2026-10-02", 100, "振込 A", "expense", 1),
    ],
  }));
  assert.deepEqual(v.outflows.map((r) => r.date), ["2026-10-02", "2026-10-20"]);
});
