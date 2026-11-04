import { test } from "node:test";
import assert from "node:assert/strict";
import { SUMMARY_MAX, buildLocalPost, cleanSummary, pickLocation } from "./googleBusinessPost.ts";

test("写真つきの投稿を組み立てる", () => {
  assert.deepEqual(buildLocalPost("  本日オープン  ", "https://x.test/a.jpg"), {
    languageCode: "ja",
    topicType: "STANDARD",
    summary: "本日オープン",
    media: [{ mediaFormat: "PHOTO", sourceUrl: "https://x.test/a.jpg" }],
  });
});

test("写真が無ければ media を付けない", () => {
  assert.equal("media" in buildLocalPost("本文"), false);
});

test("本文が空なら投稿しない", () => {
  assert.throws(() => buildLocalPost("   "));
});

test("本文は上限で切る", () => {
  assert.equal(cleanSummary("あ".repeat(SUMMARY_MAX + 10)).length, SUMMARY_MAX);
});

test("店舗は flat を含むものを選ぶ", () => {
  assert.equal(pickLocation([{ title: "別の店" }, { title: "flat. cafe" }])?.title, "flat. cafe");
  assert.equal(pickLocation([{ title: "別の店" }])?.title, "別の店");
  assert.equal(pickLocation([]), null);
});
