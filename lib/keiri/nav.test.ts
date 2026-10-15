import { test } from "node:test";
import assert from "node:assert/strict";
import { freeeLinks, inflowLabel, isKeiriPath, KEIRI_TABS } from "./nav.ts";

test("経理ナビを出すページ", () => {
  assert.equal(isKeiriPath("/keiri"), true);
  assert.equal(isKeiriPath("/ryoshusho"), true);
  assert.equal(isKeiriPath("/receipts"), true); // 保存済み領収書はタブに無いが経理画面
  assert.equal(isKeiriPath("/table"), false);
  assert.equal(KEIRI_TABS.some((t) => t.href === "/receipts"), false);
});

test("入金の区分の表示名", () => {
  assert.equal(inflowLabel("sales"), "売上金");
  assert.equal(inflowLabel("other"), "その他");
  assert.equal(inflowLabel("move"), "移動");
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
