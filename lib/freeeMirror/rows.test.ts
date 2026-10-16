import { test } from "node:test";
import assert from "node:assert/strict";
import { dealRow, readAll, transferRow, walletTxnRow } from "./rows.ts";

test("明細の行: 検索に使う列を raw から取り出す", () => {
  const raw = { id: 7, date: "2026-10-09", amount: 50000, description: "町田", entry_side: "expense" as const, status: 1, walletable_id: 4808679, walletable_type: "bank_account" };
  assert.deepEqual(walletTxnRow(raw, 12575763, "2026-10-16T01:35:00Z"), {
    company_id: 12575763, id: 7, walletable_type: "bank_account", walletable_id: 4808679, date: "2026-10-09", status: 1, raw, synced_at: "2026-10-16T01:35:00Z",
  });
});

test("取引は計上日、口座振替は日付を列に持つ", () => {
  const deal = { id: 3, issue_date: "2026-08-24", type: "expense" as const, details: [] };
  assert.equal(dealRow(deal, 1, "t").issue_date, "2026-08-24");
  const tr = { id: 4, date: "2026-10-11", amount: 3000, from_walletable_id: 1, to_walletable_id: 2 };
  assert.equal(transferRow(tr, 1, "t").date, "2026-10-11");
});

test("1000行を超えても全部読む。ちょうど1000行なら次の空ページで止まる", async () => {
  const all = Array.from({ length: 2500 }, (_, i) => i);
  const calls: [number, number][] = [];
  const got = await readAll(async (from, to) => { calls.push([from, to]); return all.slice(from, to + 1); });
  assert.equal(got.length, 2500);
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
  const just = Array.from({ length: 1000 }, (_, i) => i);
  const calls2: number[] = [];
  assert.equal((await readAll(async (f, t) => { calls2.push(f); return just.slice(f, t + 1); })).length, 1000);
  assert.deepEqual(calls2, [0, 1000]);
});
