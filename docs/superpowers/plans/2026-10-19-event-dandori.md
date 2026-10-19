# 出店イベントの段取り表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** イベントごとに、資料・ノウハウ・シフトタブからAIが「前々日〜撤収」の段取り表（横＝名前、縦＝時間）を作り、チャットで直し、スマホで見て印刷できるようにする。

**Architecture:** 純粋関数（検証・表の組み立て・ぶつかり検出・やること同期・手直しの保護）を `lib/dandori/` に分けてテストし、KVの保存と Anthropic 呼び出しは薄い層にする。店のシフトは保存せず、表示のたびに `getShifts()` から差し込む。画面は `/shutten/dandori`（「イベント」分野）、やることは既存 `/shutten` に並べる。

**Tech Stack:** Next.js 15 App Router / styled-jsx / Vercel KV（`@vercel/kv`）/ Vercel Blob（`lib/fileStore.ts`）/ `@anthropic-ai/sdk`（`client.beta.messages.parse` + `betaZodOutputFormat`、zod）/ テストは `node --test`（.ts を直接）

**Spec:** `docs/superpowers/specs/2026-10-18-event-dandori-design.md`（見本の出力：`/Users/sakamototatsurou/flat-cafe/tmp-docs/滋大祭_段取り表_1024-25.html`）

## Global Constraints

- ローカルの dev server は立てない。`npm test` と `npm run build` が通ったら sync にコミット → main に merge → `git push origin main`（fork と origin の両方へ飛ぶ）。確認は https://flat-keihi.vercel.app
- 画面の文言・コメントは日本語（周りのコードと同じ書き方）
- **シフトタブが正**。店のシフトは読むだけ。書き戻さない。表を開くたびに読み直す
- セルの種類は4つ：`shop`（灰 #ececec）／`prep`（橙 #fbe3c8）／`move`（紫 #ddd8fb）／`sell`（緑 #d6ecdf）。**どのセルも文字色は #2d2d2d に固定**
- 日の帯の色は #c7bffc、見出し行は #255240 に文字 #fef0e2（見本と同じ）
- styled-jsx：`globals.css` の汎用クラス（`.row` `.card` `.note` `.hint` `.err` `.preview` `.rc`、`button` `label` 要素）と被らない名前にする。JSXを変数に入れたり別関数部品で描くときは `:global()` か自前の `<style jsx>` を持たせる
- AIのモデルは `claude-opus-4-8`
- 印刷は A4 横、日の変わり目で改ページ（前々日と前日は同じページでよい）
- スマホは時刻の列を固定して横スクロール。名前ごとの縦画面は作らない
- ナビは「イベント」分野に `{ href: "/shutten/dandori", label: "🗓 段取り表" }` を足す

## Review Focus

- AIが日付をイベント期間外（前々日より前・最終日より後）に置く → 検証で落として、エラーとして画面に出す（Task 1）
- `24:30` など24時を超える時刻、`9:00` と `09:00` の表記ゆれ → 同じ時刻として並べ、ぶつかり判定も正しく（Task 2）
- シフトに無い名前（國仲・「全員」）や、シフトの `staff` が「バイト」 → 列は消えず、「全員」は横につないだ1行になる（Task 2）
- AIが手直し済みのセルを消す・書き換える → 手直し済みは必ず元に戻す（Task 4）
- 表を作り直したあと、チェック済みのやることが消える → 同じ日・担当・内容ならチェックを引き継ぐ（Task 3）

---

### Task 1: 型と検証

**Files:**
- Create: `lib/dandori/types.ts`, `lib/dandori/validate.ts`
- Test: `lib/dandori/validate.test.ts`
- Modify: `package.json`（`test` に `"lib/dandori/*.test.ts"` を足す）

**Interfaces:**
- Produces（`types.ts`）:
  - `type CellKind = "shop" | "prep" | "move" | "sell"`
  - `type Cell = { id: string; date: string /*YYYY-MM-DD*/; time: string /*"H:MM" または "営業中" などの短い語*/; staff: string /*名前 or "全員"*/; kind: Exclude<CellKind,"shop">; text: string; manual?: boolean }`
  - `type QtyRow = { item: string; total: number; perDay: Record<string /*date*/, number> }`
  - `type Cards = { qty: QtyRow[]; kit: string[] /*出店セット*/; rules: string[]; contacts: string[] }`
  - `type Plan = { eventId: string; days: { date: string; label: string /*例 "前々日"*/; note?: string }[]; staff: string[]; cells: Cell[]; cards: Cards; confirmed: boolean; updatedAt: string }`
  - `type Todo = { id: string; date: string; time: string; staff: string; text: string }`
- Produces（`validate.ts`）:
  - `validatePlan(p: unknown, range: { from: string; to: string }): { plan: Plan | null; errors: string[] }`
  - `qtyMismatches(cards: Cards): string[]` … `perDay` の合計が `total` と違う品目を「品目名: 合計60・日ごと58」の形で返す

- [ ] **Step 1: 失敗するテストを書く**（`validate.test.ts`）
  - `test("期間外の日付はエラー")`：range `{from:"2026-10-22", to:"2026-10-25"}` で `date:"2026-10-21"` のセル → `errors` に `"2026-10-21"` を含む文字列、`plan === null`
  - `test("kind が shop のセルは受け付けない")`：AIが店のシフトを書いてきたら弾く → errors 1件
  - `test("正しい計画はそのまま通る")`：見本の 10/23 の3セル（町田 14:30 prep「ワッフル生地の仕込み→焼き開始」等）→ `errors` 空
  - `test("仕込み数の内訳が合計と合わない")`：`{item:"クラシック", total:60, perDay:{"2026-10-24":36,"2026-10-25":22}}` → `["クラシック: 合計60・日ごと58"]`
- [ ] **Step 2: `npm test` で失敗を確認**（`Cannot find module './validate.ts'`）
- [ ] **Step 3: `types.ts` と `validate.ts` を実装**（zod は使わず手で検査。`id` が無いセルには `c_<連番>` を振る）
- [ ] **Step 4: `npm test` で通ることを確認**
- [ ] **Step 5: コミット** `git commit -m "段取り表: 型と検証"`

### Task 2: 表の組み立てとぶつかり検出

**Files:**
- Create: `lib/dandori/grid.ts`
- Test: `lib/dandori/grid.test.ts`

**Interfaces:**
- Consumes: `Plan`, `Cell`（Task 1）、`ShiftEntry`, `toMin`（`lib/shift.ts`）
- Produces:
  - `type GridRow = { time: string; span?: { kind: Cell["kind"]; text: string } /*全員の行*/; cells: Record<string /*staff*/, { kind: "shop" | Cell["kind"] | "off"; text: string }> }`
  - `type GridDay = { date: string; label: string; note?: string; rows: GridRow[] }`
  - `buildGrid(plan: Plan, shifts: ShiftEntry[]): GridDay[]`
  - `type Conflict = { date: string; staff: string; time: string; text: string; shift: string /*"9:00-14:30"*/ }`
  - `findConflicts(plan: Plan, shifts: ShiftEntry[]): Conflict[]`
- 決め事：
  - 行は日ごとに `time` の早い順（`toMin` で比較。数字でない time は日の先頭）。同じ time のセルは1行にまとめる
  - 各行の各スタッフ欄は、その人のセルがあればそれ。無ければ、その時刻がその人の店シフト内なら `{kind:"shop", text:"店（シフト）"}`、どちらでもなければ `{kind:"off", text:"—"}`
  - セルの「時間の長さ」は持たないので、ぶつかりは**セルの時刻が、同じ人の同じ日の店シフト `[start, end)` に入っていて、セルの kind が prep/move/sell**のとき1件とする。ただし同じ人の同じ日に、そのセルより前で一番近い自分のセルの text が「店」「シフト」を含む（＝店に戻る予定）場合は除外しない（単純に数える）
  - 列の並びは `plan.staff` の順

- [ ] **Step 1: 失敗するテストを書く**
  - `test("同じ時刻のセルは1行にまとまり時刻順")`：10/23 の 15:30 坂本・15:30 櫻井・14:30 町田 → rows の time が `["14:30","15:30"]`、15:30 行に2人分
  - `test("セルの無い欄は店シフト内なら店、外ならー")`：シフト `{date:"2026-10-23", staff:"町田", start:"9:00", end:"14:30"}` で 10:00 の行 → 町田は `shop`、櫻井は `off`
  - `test("24:30 のシフトも夜の行を店扱い")`：`{start:"19:30", end:"24:30"}` で time `"23:00"` → `shop`
  - `test("09:00 と 9:00 は同じ行")`
  - `test("全員のセルは span になる")`：staff `"全員"` 18:00 prep → その行の `span.text` が入り、`cells` は空
  - `test("イベント作業が店シフトと重なればぶつかり")`：シフト 櫻井 10/24 9:00-17:00、セル 櫻井 10/24 13:45 move「交代→イベントへ」→ Conflict 1件（`shift:"9:00-17:00"`）
  - `test("シフト外ならぶつからない")`
- [ ] **Step 2: `npm test` で失敗を確認**
- [ ] **Step 3: `buildGrid` と `findConflicts` を実装**（時刻の正規化は `toMin` → `fromMin`）
- [ ] **Step 4: `npm test` で通ることを確認**
- [ ] **Step 5: コミット** `git commit -m "段取り表: 表の組み立てとシフトとのぶつかり検出"`

### Task 3: やること（チェックリスト）の同期

**Files:**
- Create: `lib/dandori/todos.ts`
- Test: `lib/dandori/todos.test.ts`

**Interfaces:**
- Consumes: `Cell`, `Todo`（Task 1）
- Produces:
  - `todosFromCells(cells: Cell[], prev: Todo[]): Todo[]` … prep と move のセルをやることにする（sell は入れない）。`date|time(正規化)|staff|text` が同じ前回の Todo があればその `id` を使う。無ければ `t_<ランダム>`。前回にあって今回無いものは消える
  - `todoKey(t: Pick<Todo,"date"|"time"|"staff"|"text">): string`

- [ ] **Step 1: 失敗するテストを書く**
  - `test("同じ内容なら id を引き継ぐ")`：prev に `{id:"t_keep", date:"2026-10-23", time:"15:30", staff:"櫻井", text:"ホットサンド110枚の組み立て"}`、cells に同じ内容（time `"15:30"`）→ 結果の id が `"t_keep"`
  - `test("消えた作業はやることから消える")`
  - `test("販売のセルはやることに入らない")`
- [ ] **Step 2: 失敗を確認** → **Step 3: 実装** → **Step 4: 通ることを確認**
- [ ] **Step 5: コミット** `git commit -m "段取り表: やることをセルから作りチェックを引き継ぐ"`

### Task 4: 保存（KV）と手直しの保護

**Files:**
- Create: `lib/dandori/store.ts`, `lib/dandori/protect.ts`, `lib/dandori/knowhow.ts`
- Test: `lib/dandori/protect.test.ts`

**Interfaces:**
- Consumes: `Plan`, `Cell`, `Todo`（Task 1）、`todosFromCells`（Task 3）、`putFile/getFile/delFile`（`lib/fileStore.ts`）
- Produces（`protect.ts`、純粋）:
  - `keepManual(prev: Plan | null, next: Plan): Plan` … prev の `manual: true` のセルは、next に同じ id が無い・内容が違う場合、prev のもので置き換え／足し戻す
  - `pushVersion(versions: Plan[], p: Plan, max = 10): Plan[]` … 先頭に足し、10件まで
- Produces（`store.ts`、KV キー）:
  - `dandori:plan:<eventId>` → `Plan`、`dandori:versions:<eventId>` → `Plan[]`（新しい順）、`dandori:todos:<eventId>` → `Todo[]`、`dandori:todo-done:<eventId>` → ハッシュ（`lib/shutten.ts` の done と同じやり方）、`dandori:chat:<eventId>` → `{ role: "user"|"assistant"; text: string; at: string }[]`（直近50件）、`dandori:docs:<eventId>` → `{ id: string; name: string; type: string; key: string; at: string }[]`（中身は `putFile("dandori:doc:<id>", dataUrl)`）
  - `getPlan(eventId): Promise<Plan | null>`
  - `savePlan(eventId: string, p: Plan): Promise<void>` … 前の版を `pushVersion`、`todosFromCells` で todos も更新
  - `revertPlan(eventId): Promise<Plan | null>` … 1つ前の版に戻す
  - `getTodos(eventId): Promise<(Todo & { done: boolean })[]>`、`setTodoDone(eventId, todoId, done): Promise<void>`
  - `getChat / appendChat(eventId, msg)`、`listDocs / addDoc(eventId, name, dataUrl) / getDocData(eventId, docId) / deleteDoc(eventId, docId)`
- Produces（`knowhow.ts`）:
  - KV `dandori:knowhow` → `string[]`。初回は設計書「ノウハウ」節の10行をそのまま入れる
  - `getKnowhow(): Promise<string[]>`、`saveKnowhow(lines: string[]): Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**（`protect.test.ts`）
  - `test("手直し済みのセルをAIが消したら戻る")`
  - `test("手直し済みのセルをAIが書き換えたら元に戻る")`
  - `test("手直しでないセルはAIの案に置き換わる")`
  - `test("版は10件まで")`
- [ ] **Step 2: 失敗を確認** → **Step 3: `protect.ts` を実装、`store.ts`・`knowhow.ts` を実装**（KV の取り方は `lib/shutten.ts` の `kv()` と同じ）
- [ ] **Step 4: `npm test` と `npx tsc --noEmit -p .` が通ることを確認**
- [ ] **Step 5: コミット** `git commit -m "段取り表: 保存・版・手直しの保護・ノウハウ"`

### Task 5: AIで段取りを組む

**Files:**
- Create: `lib/dandori/ai.ts`
- Test: `lib/dandori/ai.test.ts`

**Interfaces:**
- Consumes: `Plan`, `validatePlan`, `qtyMismatches`（Task 1）、`keepManual`（Task 4）、`ShuttenEvent`（`lib/shutten.ts`）、`ShiftEntry`
- Produces:
  - `buildSystemPrompt(input: { event: ShuttenEvent; range: { from: string; to: string }; knowhow: string[]; shifts: ShiftEntry[]; current: Plan | null }): string`
  - `generatePlan(input: { event; range; knowhow; shifts; current; message: string; docs: { name: string; type: string; data: string /*base64*/ }[]; history: { role; text }[] }): Promise<{ plan: Plan; reply: string; warnings: string[] }>`
- プロンプトに必ず入れる（テストで確かめる）：
  - ノウハウ全行（見出し「必ず守るノウハウ」）
  - 期間（前々日〜最終日）と、その間の店シフトを「日付 名前 9:00-14:30」の行で
  - 「店のシフトは書き換えない。kind が shop のセルは出さない。店に入っている時間にイベントの作業を入れない」
  - current があれば JSON で渡し、「言われたところ以外は変えない。manual: true のセルは絶対に変えない」
  - 「表の下の cards も出す。qty の perDay の合計は total と一致させる」
  - 返答は `reply` に日本語で短く（何を変えたか）
- 出力は zod スキーマ（`Plan` から confirmed/updatedAt/eventId を除いたもの＋`reply`）を `betaZodOutputFormat` で受ける。`max_tokens: 8000`。資料は PDF→`document`、画像→`image` ブロック（`app/api/bills/extract/route.ts` と同じ）
- 受けたら `validatePlan` → 失敗なら errors を投げる。`keepManual(current, plan)` を通す。`qtyMismatches` は warnings に入れる

- [ ] **Step 1: 失敗するテストを書く**（`buildSystemPrompt` だけ。API は呼ばない）
  - `test("ノウハウが全部入る")`：knowhow `["ワッフルは前日の昼過ぎから3時間","2枚で6分"]` → 両方を含む
  - `test("店シフトが日付と名前と時間の行で入る")`：→ `"2026-10-24 櫻井 9:00-17:00"` を含む
  - `test("今の表があれば変えない指示と JSON が入る")`：→ `"manual: true"` と current のセル text を含む
- [ ] **Step 2: 失敗を確認** → **Step 3: 実装** → **Step 4: `npm test` と型チェックが通る**
- [ ] **Step 5: コミット** `git commit -m "段取り表: AIで資料・ノウハウ・シフトから組む"`

### Task 6: API

**Files:**
- Create: `app/api/dandori/route.ts`

**Interfaces:**
- Consumes: Task 2〜5 の関数、`getEvents`（`lib/shutten.ts`）、`getShifts`（`lib/shift.ts`）
- Produces:
  - `GET /api/dandori?id=<eventId>` → `{ events, id, plan, grid: GridDay[], conflicts: Conflict[], todos, chat, docs: {id,name,type,at}[], knowhow }`。id 省略時は `/api/shutten` と同じく今日以降で一番近いイベント
  - `POST /api/dandori` `{ action, id, ... }`：
    - `"chat"` `{ message, from, to }`（期間。初回だけ必須、以後は plan.days から）→ confirmed なら 409「確定済みです。解除してから直してください」。成功で `{ reply, warnings }`
    - `"editCell"` `{ cell: Cell }`（新規は id なし）→ `manual: true` を付けて保存
    - `"deleteCell"` `{ cellId }`、`"revert"`、`"confirm"` `{ confirmed: boolean }`
    - `"todoDone"` `{ todoId, done }`
    - `"addDoc"` `{ name, dataUrl }`（4MB を超えたら 413「4MBまでのファイルにしてください」）、`"deleteDoc"` `{ docId }`
    - `"saveKnowhow"` `{ lines: string[] }`
  - `export const maxDuration = 300`（AI が長いため）

- [ ] **Step 1: 実装**（`app/api/shutten/route.ts` と同じ形。エラーは `{ error }` と 400/404/409/500）
- [ ] **Step 2: `npx tsc --noEmit -p .` と `npm run build` が通る**
- [ ] **Step 3: コミット** `git commit -m "段取り表: API"`

### Task 7: 画面（段取り表・チャット・資料・ノウハウ）とナビ、やることの表示

**Files:**
- Create: `app/shutten/dandori/page.tsx`
- Modify: `components/Nav.tsx`（「イベント」分野の先頭に段取り表）、`app/shutten/page.tsx`（持ち物の上に「やること」節）、`lib/systemGuide.ts`（`/shutten/dandori` の説明1行）

**Interfaces:**
- Consumes: `GET/POST /api/dandori`（Task 6）
- 画面の構成（上から）：
  1. イベント選択（`/shutten` と同じ select）
  2. ぶつかり警告（conflicts があれば赤枠で「町田 10/24 13:45 交代→イベントへ が店のシフト 9:00-17:00 と重なっています」の形で全件）
  3. 状態：確定済みバッジ、「確定する／確定を解除」「1つ前に戻す」「印刷」（`window.print()`）
  4. 表：見本と同じ見た目（Global Constraints の色）。`<table>` に `min-width: 760px`、外側を横スクロール、**時刻の列は `position: sticky; left: 0`**。セルを押すと編集フォーム（時刻・担当・種類・内容、削除）。日ごとに「＋行を足す」
  5. カード（仕込み数／出店セット／決まり／連絡先）。仕込み数が合わなければ warnings を表示
  6. チャット：履歴＋入力欄＋送信。初回（plan なし）は期間（開始日・最終日）の入力も出す。送信中は「段取りを組んでいます…（1分ほどかかります）」
  7. 資料：ファイル選択（PDF・画像、複数可）→ 一覧と削除
  8. ノウハウ：1行1件のテキストエリア＋保存
- やること（`/shutten` 側）：その event の todos を日付・時刻順、チェックボックス（`todoDone`）、担当を右に。段取り表がまだ無ければ節ごと出さない
- 印刷用 CSS：`@page { size: A4 landscape; margin: 10mm }`、`@media print` でナビ・チャット・資料・ノウハウ・ボタンを隠し、日の帯の行に `break-before: page`（最初の2日はまとめる＝2日目の帯には付けない）、`tr { break-inside: avoid }`
- クラス名は `dd-` で始める（`globals.css` と被らせない）

- [ ] **Step 1: 実装**
- [ ] **Step 2: `npm test`・型チェック・`npm run build` が通る**
- [ ] **Step 3: コミット** `git commit -m "段取り表: 画面・ナビ・やること"`
- [ ] **Step 4: sync を main に merge して `git push origin main`。デプロイ後、本番で `/shutten/dandori` を開き、ブラウザの javascript で `getComputedStyle` を見て、時刻の列が `sticky`、セルの文字色が `rgb(45, 45, 45)` になっていることを確認**

### Task 8: 滋大祭の段取りを初期データとして入れる

**Files:**
- Modify: `lib/shutten.ts`（`SEED_EVENTS` に `{ id: "2026-10-24-shidaisai", title: "滋大祭", date: "2026-10-24", memo: "滋賀大学 裏グラウンド。24日 9:30-19:00／25日 9:30-16:00。緊急連絡 岩月 080-9298-4956・須藤 090-6645-4400" }`。持ち物はひこねいろと同じ seed）
- Modify: `lib/dandori/store.ts`（`getPlan` が KV に無いとき、`2026-10-24-shidaisai` なら見本 HTML の内容を `Plan` にしたものを返して保存。店シフトの行は入れない）

- [ ] **Step 1: 見本 HTML の各行を `Cell` に写す**（店（シフト）と — の欄は入れない。days は 10/22 前々日・10/23 前日・10/24 1日目・10/25 2日目、staff は `["坂本","町田","櫻井"]`、cards は見本のカード4枚）
- [ ] **Step 2: `validatePlan` を通すテストを1本**（`test("滋大祭の初期データが検証を通る")`、qtyMismatches が空）
- [ ] **Step 3: `npm test`・`npm run build` → コミット → main に push**
