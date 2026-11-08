import { test } from "node:test";
import assert from "node:assert/strict";
import { eventLabel, eventSalesFromDeals } from "./eventSales.ts";

const SALES = 1035440073;
const deal = (o: { date: string; origin?: string; type?: "income" | "expense"; lines: { desc: string; amount: number; account?: number; side?: "debit" | "credit" }[] }) => ({
  id: 1,
  issue_date: o.date,
  type: o.type ?? ("income" as const),
  deal_origin_name: o.origin ?? "手動",
  details: o.lines.map((l) => ({ account_item_id: l.account ?? SALES, amount: l.amount, description: l.desc, entry_side: l.side ?? ("credit" as const) })),
});

test("摘要の頭からイベント名を取る", () => {
  assert.equal(eventLabel("彦根シティマラソン（11/8）出店 売上（イベント）合計 ¥42,400"), "彦根シティマラソン");
  assert.equal(eventLabel("ひこねいろ文化祭（荒神山 10/12）出店 売上（イベント）"), "ひこねいろ文化祭");
  assert.equal(eventLabel("えびす講 出店 売上（イベント）"), "えびす講");
  assert.equal(eventLabel("（イベント）"), "イベント");
});

test("手で入れた売上高のうち、摘要に「イベント」がある行だけを、日付とイベント名ごとにまとめる", () => {
  const got = eventSalesFromDeals([
    deal({ date: "2026-11-03", lines: [{ desc: "城祭り（11/3・金亀食堂さんの前で販売）売上（イベント）PayPay", amount: 11950 }] }),
    deal({ date: "2026-11-03", lines: [{ desc: "城祭り（11/3・金亀食堂さんの前で販売）売上（イベント）現金", amount: 8500 }] }),
    deal({ date: "2026-11-08", lines: [{ desc: "彦根シティマラソン（11/8）出店 売上（イベント）", amount: 41000 }] }),
    deal({ date: "2026-11-04", lines: [{ desc: "Uber Eats 入金（手数料差引後の額）", amount: 9570 }] }),
  ], SALES);
  assert.deepEqual(got, [
    { date: "2026-11-03", label: "城祭り", amount: 20450 },
    { date: "2026-11-08", label: "彦根シティマラソン", amount: 41000 },
  ]);
});

test("Square 連携の取引・売上高でない行・費用の取引は数えない。借方の売上は引く", () => {
  const got = eventSalesFromDeals([
    deal({ date: "2026-11-08", origin: "Square（API）", lines: [{ desc: "【売上】 イベント 合同会社flat.", amount: 5000 }] }),
    deal({ date: "2026-11-08", lines: [{ desc: "出店料（イベント）", amount: 6000, account: 999 }] }),
    deal({ date: "2026-11-08", type: "expense", lines: [{ desc: "えびす講（イベント）", amount: 3000 }] }),
    deal({ date: "2026-11-09", lines: [
      { desc: "えびす講（11/9）売上（イベント）", amount: 10000 },
      { desc: "えびす講（11/9）売上（イベント）の打ち間違いの戻し", amount: 1000, side: "debit" },
    ] }),
  ], SALES);
  assert.deepEqual(got, [{ date: "2026-11-09", label: "えびす講", amount: 9000 }]);
});
