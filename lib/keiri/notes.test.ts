import { test } from "node:test";
import assert from "node:assert/strict";
import { addMemo, memosForMonth, NOTE_MAX, putMark, removeMemo, setMemoDone, type KeiriMemo } from "./notes.ts";

const NOW = "2026-10-15T10:00:00.000Z";

test("行に色とメモを付ける。知らない色は色なしにする", () => {
  const m = putMark({}, "w1", { color: "yellow", note: "返品予定" }, NOW);
  assert.deepEqual(m, { w1: { color: "yellow", note: "返品予定", updatedAt: NOW } });
  const bad = putMark({}, "w2", { color: "purple", note: "x" }, NOW);
  assert.deepEqual(bad, { w2: { note: "x", updatedAt: NOW } });
});

test("色をなしにしてメモを空白だけにすると、その行の印を消す", () => {
  const before = { w1: { color: "yellow" as const, updatedAt: NOW }, w2: { note: "残す", updatedAt: NOW } };
  const after = putMark(before, "w1", { color: "", note: "   " }, NOW);
  assert.deepEqual(after, { w2: { note: "残す", updatedAt: NOW } });
  assert.equal("w1" in before, true); // 元の印は書き換えない
});

test("メモは前後の空白を取り、500文字で切る", () => {
  const m = putMark({}, "w1", { note: `  ${"あ".repeat(NOTE_MAX + 10)}  ` }, NOW);
  assert.equal(m.w1.note?.length, NOTE_MAX);
  assert.equal(m.w1.color, undefined);
});

const memo = (over: Partial<KeiriMemo>): KeiriMemo => ({
  id: "m", month: "2026-09", text: "t", done: false, createdAt: "2026-09-10T00:00:00.000Z", ...over,
});

test("経理メモは書いた月から、済みにするまで次の月以降にも出る", () => {
  const open = memo({ id: "a" });
  assert.deepEqual(memosForMonth([open], "2026-08").map((m) => m.id), []);
  assert.deepEqual(memosForMonth([open], "2026-09").map((m) => m.id), ["a"]);
  assert.deepEqual(memosForMonth([open], "2026-10").map((m) => m.id), ["a"]);
  const done = memo({ id: "a", done: true, doneAt: "2026-10-01T00:00:00.000Z" });
  assert.deepEqual(memosForMonth([done], "2026-09").map((m) => m.id), ["a"]);
  assert.deepEqual(memosForMonth([done], "2026-10").map((m) => m.id), []);
});

test("12月に書いた経理メモは、翌年1月にも出る", () => {
  assert.deepEqual(memosForMonth([memo({ id: "dec", month: "2026-12" })], "2027-01").map((m) => m.id), ["dec"]);
});

test("経理メモは済みでないものが先、その中は書いた順", () => {
  const list = [
    memo({ id: "done", done: true, createdAt: "2026-09-01T00:00:00.000Z" }),
    memo({ id: "late", createdAt: "2026-09-20T00:00:00.000Z" }),
    memo({ id: "early", createdAt: "2026-09-05T00:00:00.000Z" }),
  ];
  assert.deepEqual(memosForMonth(list, "2026-09").map((m) => m.id), ["early", "late", "done"]);
});

test("経理メモを足す・済みにする・戻す・消す", () => {
  const added = addMemo([], { month: "2026-10", text: "  8/19のAmazonは2回払い  " }, "km1", NOW);
  assert.deepEqual(added, [{ id: "km1", month: "2026-10", text: "8/19のAmazonは2回払い", done: false, createdAt: NOW }]);
  const done = setMemoDone(added, "km1", true, NOW);
  assert.deepEqual([done[0].done, done[0].doneAt], [true, NOW]);
  const back = setMemoDone(done, "km1", false, NOW);
  assert.equal(back[0].done, false);
  assert.equal("doneAt" in back[0], false);
  assert.deepEqual(removeMemo(back, "km1"), []);
});

test("空の経理メモは足せない。無いメモは済みにできない", () => {
  assert.throws(() => addMemo([], { month: "2026-10", text: "   " }, "km1", NOW), /メモが空です/);
  assert.throws(() => setMemoDone([], "nope", true, NOW), /メモが見つかりません/);
});
