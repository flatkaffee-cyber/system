import { test } from "node:test";
import assert from "node:assert/strict";
import { groupSites, isSiteOnly, type SiteRow } from "./sites.ts";

const KINDS = ["駐車場", "光熱・通信", "会計・銀行", "その他"];
const site = (over: Partial<SiteRow> & { title?: string }) => ({ kind: "その他", active: true, portalUrl: "https://example.com", ...over });

test("決めた順に見出しを並べ、残りの種類は後ろに続ける", () => {
  const groups = groupSites([site({ kind: "駐車場" }), site({ kind: "光熱・通信" }), site({ kind: "会計・銀行" })], KINDS);
  assert.deepEqual(groups.map((g) => g.kind), ["会計・銀行", "光熱・通信", "駐車場"]);
});

test("URLもIDも無い契約と、終わった契約は出さない", () => {
  const groups = groupSites([
    site({ title: "URLあり" }),
    site({ title: "IDだけ", portalUrl: undefined, loginId: "A1" }),
    site({ title: "どちらも無い", portalUrl: undefined }),
    site({ title: "終了", active: false }),
  ], KINDS);
  assert.deepEqual(groups[0].sites.map((s) => s.title), ["URLあり", "IDだけ"]);
});

test("知らない種類はその他に入れて、見失わない", () => {
  const groups = groupSites([site({ kind: "昔の種類" })], KINDS);
  assert.deepEqual(groups.map((g) => [g.kind, g.sites.length]), [["その他", 1]]);
});

test("契約の中身があるものはサイトだけの登録として扱わない", () => {
  assert.equal(isSiteOnly(site({})), true);
  assert.equal(isSiteOnly(site({ startDate: "2026-09-01" })), false);
  assert.equal(isSiteOnly(site({ monthlyAmount: 6270 })), false);
  assert.equal(isSiteOnly(site({ notes: "契約番号" })), false);
});
