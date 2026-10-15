import { test } from "node:test";
import assert from "node:assert/strict";
import { freeeLinks, isKeiriPath, KEIRI_TABS, keiriMenu, keiriPageLabel } from "./nav.ts";

test("経理のレイアウトで出すページ", () => {
  assert.equal(isKeiriPath("/keiri"), true);
  assert.equal(isKeiriPath("/ryoshusho"), true);
  assert.equal(isKeiriPath("/receipts"), true);
  assert.equal(isKeiriPath("/table"), false);
  assert.equal(KEIRI_TABS.length, 15);
});

test("サイドバーの分野と並び", () => {
  const menu = keiriMenu();
  assert.deepEqual(menu.map((g) => g.label), ["", "記録する", "支払い", "集計", "書類"]);
  assert.deepEqual(menu.map((g) => g.tabs.map((t) => t.href)), [
    ["/keiri"],
    ["/ryoshusho", "/receipts", "/meisai", "/pending"],
    ["/kariire", "/payables", "/bills", "/loans"],
    ["/items", "/report"],
    ["/shorui", "/contracts", "/company", "/zeirishi"],
  ]);
});

test("スマホの帯に出すページ名は絵文字を除く", () => {
  assert.equal(keiriPageLabel("/keiri"), "月次");
  assert.equal(keiriPageLabel("/receipts"), "保存済み領収書");
  assert.equal(keiriPageLabel("/zeirishi"), "税理士");
  assert.equal(keiriPageLabel("/table"), undefined);
});

test("行から開ける freee の画面（2026-10-15 に開けることを確かめたURL）", () => {
  assert.deepEqual(freeeLinks({ walletTxnId: 2429972226, journalId: 3743184556 }), [
    { label: "freeeで明細を開く", href: "https://secure.freee.co.jp/wallet_txns/stream/2429972226" },
    { label: "freeeで振替伝票を開く", href: "https://secure.freee.co.jp/reports/journals?deal_id=3743184556" },
  ]);
  assert.deepEqual(freeeLinks({ dealId: 3841125832 }), [
    { label: "freeeで取引を開く", href: "https://secure.freee.co.jp/reports/journals?deal_id=3841125832" },
  ]);
  assert.deepEqual(freeeLinks({}), []);
});
