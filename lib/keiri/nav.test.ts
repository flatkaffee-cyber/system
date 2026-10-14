import { test } from "node:test";
import assert from "node:assert/strict";
import { inflowLabel, isKeiriPath, KEIRI_TABS } from "./nav.ts";

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
