// 経理の画面の部品が、サイト全体の CSS（app/globals.css）や経理のページの全画面表示とぶつからないことを確かめる。
// styled-jsx のスコープは「クラスを足す」だけなので、全体用の .row { display:flex } のようなものがそのまま当たる
// （2026-10-15 のレビューで、表の行が崩れ、領収書の列に全体用の .rc の点線が付いた）。画面の部品はテストできないので、ソースを読んで確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** わざと全体のスタイルを使うクラス（.card・.hint）と、部品の側で全部上書きしているクラス（.err） */
const SHARED = new Set(["card", "hint", "err"]);
const CLASS = /^[a-zA-Z][\w-]*$/;

/** 全体の CSS で、1つのクラスだけで始まるセレクタ（.row・.row > * など）のクラス。.arrow.open のような組み合わせは数えない */
function globalClasses(): Set<string> {
  const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Set<string>();
  for (const rule of css.matchAll(/([^{}]+)\{/g)) {
    for (const sel of rule[1].split(",")) {
      const first = sel.trim().split(/[\s>+~]+/)[0].replace(/::?[\w-]+(\([^)]*\))?/g, "");
      const m = /^\.([a-zA-Z][\w-]*)$/.exec(first);
      if (m) out.add(m[1]);
    }
  }
  return out;
}

/** className="…" と className={`…`}（${} の外の文字と、${} の中の三項演算子の結果の "…"）からクラス名を拾う */
function componentClasses(file: string): Set<string> {
  const out = new Set<string>();
  for (const m of read(file).matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const text = m[1] ?? m[2];
    const exprs = [...text.matchAll(/\$\{([^}]*)\}/g)].map((x) => x[1]);
    const words = [
      ...text.replace(/\$\{[^}]*\}/g, " ").split(/\s+/),
      ...exprs.flatMap((e) => [...e.matchAll(/[?:]\s*"([^"]*)"/g)].flatMap((x) => x[1].split(/\s+/))),
    ];
    for (const w of words) if (CLASS.test(w)) out.add(w);
  }
  return out;
}

test("経理の部品のクラス名は、サイト全体の CSS のクラスとぶつからない", () => {
  const globals = globalClasses();
  const files = readdirSync(join(ROOT, "components/keiri"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `components/keiri/${f}`);
  const clashes = files.flatMap((f) =>
    [...componentClasses(f)].filter((c) => globals.has(c) && !SHARED.has(c)).map((c) => `${f}: .${c}`),
  );
  assert.deepEqual(clashes, []);
});

test("経理のサイドバーとスマホの帯は、経理のページの全画面表示（画像・PDFのビューア）より下に描く", () => {
  const zOf = (src: string, block: RegExp) =>
    [...src.matchAll(block)].flatMap((m) => [...m[0].matchAll(/z-index:\s*(\d+)/g)].map((x) => Number(x[1])));
  const shell = zOf(read("components/keiri/KeiriShell.tsx"), /\.(?:side|topbar)\s*\{[^}]*\}/g);
  const overlays = readdirSync(join(ROOT, "app/(keiri)"))
    .map((d) => `app/(keiri)/${d}/page.tsx`)
    .filter((p) => existsSync(join(ROOT, p)))
    .flatMap((p) => zOf(read(p), /\{[^{}]*position:\s*fixed;[^{}]*inset:\s*0[^{}]*\}/g));
  assert.ok(shell.length >= 2, "サイドバーと帯の z-index が見つからない");
  assert.ok(overlays.length >= 2, "ビューアの z-index が見つからない");
  assert.ok(Math.max(...shell) < Math.min(...overlays), `サイドバー・帯 ${Math.max(...shell)} / 全画面表示 ${Math.min(...overlays)}`);
});
