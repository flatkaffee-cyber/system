import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPl, KINTOWARI_MONTHLY } from "./pl.ts";
import type { FreeeDeal, FreeeJournal, TrialPlBalance } from "./types.ts";

const fx = JSON.parse(
  readFileSync(new URL("./__fixtures__/trial_pl_2026-09.json", import.meta.url), "utf8"),
) as { up_to_date: boolean; balances: TrialPlBalance[] };

const names = new Map<number, string>([
  [1, "売上高"],
  [2, "地代家賃"],
  [3, "支払手数料"],
  [4, "普通預金"],
  [5, "消耗品費"],
  [6, "現金"],
]);

const sept = (deals: FreeeDeal[] = [], journals: FreeeJournal[] = []) =>
  buildPl({ balances: fx.balances, upToDate: fx.up_to_date, deals, journals, accountNames: names });

const line = (v: ReturnType<typeof buildPl>, key: string) => {
  const l = v.lines.find((x) => x.key === key);
  assert.ok(l, `${key} の行がない`);
  return l;
};

test("9月の各段の利益が試算表と一致する", () => {
  const v = sept();
  assert.equal(line(v, "sales").amount, 713513);
  assert.equal(line(v, "cogs").amount, 256738);
  assert.equal(line(v, "gross").amount, 456775);
  assert.equal(line(v, "sga").amount, 605339);
  assert.equal(line(v, "operating").amount, -148564);
  assert.equal(line(v, "nonOpIncome").amount, 10811);
  assert.equal(line(v, "nonOpExpense").amount, 15792);
  assert.equal(line(v, "ordinary").amount, -153545);
  assert.equal(line(v, "pretax").amount, -153545);
  assert.equal(v.pretax, -153545);
});

test("役員報酬と人件費を別に出す", () => {
  const v = sept();
  assert.equal(v.officerPay, 188997);
  assert.equal(v.laborCost, 0);
});

test("赤字の月の税金は均等割だけの見込み", () => {
  const v = sept();
  assert.deepEqual(v.tax, { amount: KINTOWARI_MONTHLY, estimated: true });
  assert.equal(v.netIncome, -153545 - 5833);
  assert.equal(line(v, "tax").label, "法人税等（見込み）");
  assert.equal(line(v, "net").label, "当期純利益（見込み）");
});

test("黒字の月の税金は25%＋均等割", () => {
  const balances = fx.balances.map((b) =>
    b.account_category_name === "税引前当期純損益金額" && b.total_line
      ? { ...b, opening_balance: 0, closing_balance: 100000 }
      : b,
  );
  const v = buildPl({ balances, upToDate: true, deals: [], journals: [], accountNames: names });
  assert.deepEqual(v.tax, { amount: 25000 + KINTOWARI_MONTHLY, estimated: true });
  assert.equal(v.netIncome, 100000 - 25000 - KINTOWARI_MONTHLY);
});

test("帳簿に法人税等がある月は帳簿の額を使う", () => {
  const balances = fx.balances.map((b) =>
    b.account_category_name === "法人税等" && b.total_line ? { ...b, closing_balance: 70000 } : b,
  );
  const v = buildPl({ balances, upToDate: true, deals: [], journals: [], accountNames: names });
  assert.deepEqual(v.tax, { amount: 70000, estimated: false });
  assert.equal(line(v, "tax").label, "法人税等");
});

test("販管費は金額が動いた科目だけ、仕訳つきで出す", () => {
  const deals: FreeeDeal[] = [
    {
      id: 10,
      issue_date: "2026-09-02",
      type: "expense",
      details: [{ account_item_id: 2, amount: 104830, description: "店舗家賃", entry_side: "debit" }],
    },
  ];
  const v = sept(deals);
  const sga = line(v, "sga").accounts ?? [];
  assert.equal(sga.find((a) => a.name === "交際費"), undefined); // 9月に動いていない
  const rent = sga.find((a) => a.name === "地代家賃");
  assert.equal(rent?.amount, 146830);
  assert.deepEqual(rent?.entries, [
    { date: "2026-09-02", description: "店舗家賃", amount: 104830, sourceType: "deal", sourceId: 10 },
  ]);
});

test("売上の仕訳は貸方をプラスで出す", () => {
  const deals: FreeeDeal[] = [
    {
      id: 11,
      issue_date: "2026-09-11",
      type: "income",
      details: [{ account_item_id: 1, amount: 11000, description: "Tシャツ", entry_side: "credit" }],
    },
  ];
  const v = sept(deals);
  const sales = line(v, "sales").accounts?.find((a) => a.name === "売上高");
  assert.equal(sales?.entries[0].amount, 11000);
});

test("振替伝票の行も科目に入る", () => {
  const journals: FreeeJournal[] = [
    {
      id: 20,
      issue_date: "2026-09-21",
      details: [
        { account_item_id: 5, amount: 2378, description: "発泡箱", entry_side: "debit" },
        { account_item_id: 6, amount: 2378, description: "発泡箱", entry_side: "credit" },
      ],
    },
  ];
  const v = sept([], journals);
  const sup = line(v, "sga").accounts?.find((a) => a.name === "消耗品費");
  assert.deepEqual(sup?.entries, [
    { date: "2026-09-21", description: "発泡箱", amount: 2378, sourceType: "journal", sourceId: 20 },
  ]);
});

test("集計中フラグをそのまま渡す", () => {
  const v = buildPl({ balances: fx.balances, upToDate: false, deals: [], journals: [], accountNames: names });
  assert.equal(v.upToDate, false);
});
