import { test } from "node:test";
import assert from "node:assert/strict";
import { SUMMARY_MAX, buildLocalPost, captionToSummary, cleanSummary, feedImage, newFeedPosts, pickLocation } from "./googleBusinessPost.ts";

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

test("つないだあとの24時間以内の投稿だけを古い順に返す", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  const got = newFeedPosts(
    [
      { id: "new", timestamp: "2026-11-10T11:00:00+0000" },
      { id: "older", timestamp: "2026-11-10T09:00:00+0000" },
      { id: "stale", timestamp: "2026-11-09T09:00:00+0000" },
      { id: "before", timestamp: "2026-11-01T09:00:00+0000" },
      { id: "no-time" },
    ],
    "2026-11-05T00:00:00Z",
    now,
  );
  assert.deepEqual(got.map((m) => m.id), ["older", "new"]);
});

test("キャプションからハッシュタグを除く", () => {
  assert.equal(captionToSummary("本日のスープ\n\n#彦根 #カフェ"), "本日のスープ");
  assert.equal(captionToSummary("彦根の#flat です"), "彦根の です");
});

test("キャプションが無くても投稿できる文にする", () => {
  assert.equal(captionToSummary("#彦根"), "Instagramを更新しました。");
  assert.equal(captionToSummary(undefined), "Instagramを更新しました。");
});

test("動画はサムネイルを使う", () => {
  assert.equal(feedImage({ id: "1", media_type: "VIDEO", media_url: "v.mp4", thumbnail_url: "t.jpg" }), "t.jpg");
  assert.equal(feedImage({ id: "2", media_type: "IMAGE", media_url: "a.jpg" }), "a.jpg");
});

test("リンクボタンを付けられる", () => {
  assert.deepEqual(buildLocalPost("本文", undefined, "https://x.test/p").callToAction, { actionType: "LEARN_MORE", url: "https://x.test/p" });
});
