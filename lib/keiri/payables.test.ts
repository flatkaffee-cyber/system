import { test } from "node:test";
import assert from "node:assert/strict";
import { payablesFromTrialBs } from "./payables.ts";

test("役員借入金の取引先別の残高から、払うものを出す", () => {
  const balances = [
    { account_item_id: 1035440040, closing_balance: 16569, partners: [] },
    { account_item_id: 1035440156, closing_balance: 329277, partners: [
      { id: 0, name: "未選択", closing_balance: 63359 },
      { id: 120937277, name: "國仲", closing_balance: 8246 },
      { id: 119628576, name: "坂本", closing_balance: -1597 },
      { id: 120409578, name: "櫻井", closing_balance: 385609 },
      { id: 125481061, name: "櫻井勘吉", closing_balance: -30000 },
      { id: 122910929, name: "町田", closing_balance: 3660 },
    ] },
  ];
  assert.deepEqual(payablesFromTrialBs(balances, 1035440156), {
    total: 329277,
    byPartner: [
      { id: 120937277, name: "國仲", amount: 8246 },
      { id: 120409578, name: "櫻井", amount: 385609 },
      { id: 122910929, name: "町田", amount: 3660 },
    ],
  });
  assert.deepEqual(payablesFromTrialBs([], 1035440156), { total: 0, byPartner: [] });
});
