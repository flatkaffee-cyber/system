import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSheet, monthTabs, NO_FILTER, rowKeyToggles, clearsOnLoad } from "./sheet.ts";
import type { CashRow } from "./types.ts";

const row = (over: Partial<CashRow>): CashRow => ({
  key: "k", date: "2026-10-05", amount: 1000, title: "t", account: "", description: "",
  kind: "expense", tag: "card", status: "done", ...over,
});

test("区切りは 入金→カード→銀行→現金→立替→移動 の順。0件の区切りは出さない", () => {
  const s = buildSheet({
    inflows: [row({ key: "i1", kind: "sales", tag: undefined })],
    outflows: [
      row({ key: "t1", tag: "tatekae" }),
      row({ key: "c1", tag: "card" }),
      row({ key: "k1", tag: "cash" }),
    ],
  }, NO_FILTER);
  assert.deepEqual(s.sections.map((x) => [x.key, x.label]), [["in", "入金"], ["card", "カード"], ["cash", "現金"], ["tatekae", "立替"]]);
});

test("移動はATMの出金も預け入れも移動の区切りに出し、入金計・出金計には入れない", () => {
  const s = buildSheet({
    inflows: [
      row({ key: "i1", kind: "sales", tag: undefined, amount: 10000 }),
      row({ key: "dep", kind: "move", tag: undefined, amount: 50000 }),
    ],
    outflows: [
      row({ key: "c1", tag: "card", amount: 3000 }),
      row({ key: "atm", kind: "move", tag: "bank", amount: 9000 }),
    ],
  }, NO_FILTER);
  const move = s.sections.find((x) => x.key === "move");
  assert.deepEqual(move?.rows.map((r) => r.key).sort(), ["atm", "dep"]);
  assert.deepEqual([move?.inSum, move?.outSum], [50000, 9000]);
  assert.equal(s.sections.some((x) => x.key === "bank"), false);
  assert.deepEqual(s.totals, { in: 10000, out: 3000, net: 7000 });
});

test("区切りごとの小計と、区切りの中の日付順", () => {
  const s = buildSheet({
    inflows: [],
    outflows: [
      row({ key: "b", date: "2026-10-20", amount: 300 }),
      row({ key: "a", date: "2026-10-02", amount: 100 }),
    ],
  }, NO_FILTER);
  assert.deepEqual(s.sections[0].rows.map((r) => r.date), ["2026-10-02", "2026-10-20"]);
  assert.deepEqual([s.sections[0].inSum, s.sections[0].outSum], [0, 400]);
  assert.ok(s.sections[0].rows.every((r) => r.side === "out"));
});

test("検索は相手・科目・摘要・メモで探し、全角と半角、大文字と小文字を区別しない", () => {
  const view = {
    inflows: [],
    outflows: [
      row({ key: "amz", title: "ＡＭＡＺＯＮ．ＣＯ．ＪＰ" }),
      row({ key: "acct", title: "x", account: "消耗品費" }),
      row({ key: "memo", title: "y" }),
      row({ key: "other", title: "z", description: "ガソリン" }),
    ],
  };
  const keys = (query: string) =>
    buildSheet(view, { ...NO_FILTER, query }, { memo: "返品予定" }).sections.flatMap((x) => x.rows.map((r) => r.key));
  assert.deepEqual(keys("amazon"), ["amz"]);
  assert.deepEqual(keys("消耗品"), ["acct"]);
  assert.deepEqual(keys("返品"), ["memo"]);
  assert.deepEqual(keys("  ガソリン "), ["other"]);
});

test("「領収書なしだけ」「未処理だけ」で絞り、小計と合計も絞った行で出す", () => {
  const view = {
    inflows: [row({ key: "i", kind: "sales", tag: undefined, amount: 5000, status: "todo" })],
    outflows: [
      row({ key: "miss", amount: 100, receiptStatus: "missing" }),
      row({ key: "rec", amount: 200, receiptStatus: "missing-recorded", status: "waiting" }),
      row({ key: "ok", amount: 400, receiptStatus: "attached" }),
    ],
  };
  const missing = buildSheet(view, { ...NO_FILTER, missingOnly: true });
  assert.deepEqual(missing.sections.flatMap((x) => x.rows.map((r) => r.key)), ["miss", "rec"]);
  assert.deepEqual(missing.totals, { in: 0, out: 300, net: -300 });

  const todo = buildSheet(view, { ...NO_FILTER, todoOnly: true });
  assert.deepEqual(todo.sections.flatMap((x) => x.rows.map((r) => r.key)), ["i", "rec"]);
});

test("条件に合う行が無ければ、区切りは無く合計は0", () => {
  const s = buildSheet({ inflows: [], outflows: [row({ key: "a" })] }, { ...NO_FILTER, query: "存在しない店" });
  assert.deepEqual(s, { sections: [], totals: { in: 0, out: 0, net: 0 } });
});

test("月のタブは2026年6月から今月まで、新しい月が先。年をまたいでも並ぶ", () => {
  assert.deepEqual(monthTabs("2026-10"), ["2026-10", "2026-09", "2026-08", "2026-07", "2026-06"]);
  const next = monthTabs("2027-01");
  assert.deepEqual(next.slice(0, 2), ["2027-01", "2026-12"]);
  assert.equal(next.length, 8);
  assert.deepEqual(monthTabs("2026-06"), ["2026-06"]);
});

test("行のキー操作で開閉するのは、行そのものにフォーカスがあるときの Enter と Space だけ（中のボタンやリンクの Enter は奪わない）", () => {
  assert.equal(rowKeyToggles("Enter", true), true);
  assert.equal(rowKeyToggles(" ", true), true);
  assert.equal(rowKeyToggles("Enter", false), false);
  assert.equal(rowKeyToggles(" ", false), false);
  assert.equal(rowKeyToggles("a", true), false);
});

test("読み直しで画面を空にするのは、月か見方が変わったときだけ（札の付け替えのあとは前の表を出したまま）", () => {
  assert.equal(clearsOnLoad(null, { month: "2026-09", view: "cash" }), true);
  assert.equal(clearsOnLoad({ month: "2026-09", view: "cash" }, { month: "2026-10", view: "cash" }), true);
  assert.equal(clearsOnLoad({ month: "2026-09", view: "cash" }, { month: "2026-09", view: "pl" }), true);
  assert.equal(clearsOnLoad({ month: "2026-09", view: "cash" }, { month: "2026-09", view: "cash" }), false);
});
