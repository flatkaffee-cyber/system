# 月次の結果をそろえ、全体・店舗・イベントで切り替える Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 経理画面の月次と月次レポートで同じ「店舗・イベント・臨時・全体」の数字を出し、経理画面では全体・店舗だけ・イベントで切り替えられるようにする。

**Architecture:** 月次レポートの「行を作って店舗・イベント・臨時に振り分ける」部分を純粋な関数（`lib/keiri/buckets.ts`）に移し、月次レポートと経理画面の API の両方がそれを使う。4つの数字は `scopeTotals` 1か所で出す。経理画面の表の行の区分は、同じ振り分けを取引ごとにまとめた値から決める。

**Tech Stack:** Next.js 15（App Router）、React 19、TypeScript、styled-jsx、`node --test`。読む先は `pickSource()`（Supabase の写し）。

**Spec:** `docs/superpowers/specs/2026-10-18-keiri-scope-design.md`

## Global Constraints

- 数え方は月次レポートのまま（計上日で数える、見込みの費用を引く、イベント日の Square の売上を通常からイベントへ移す、振り分けの決まりと付け替えの保存先 KV `monthly:overrides` は今のまま）
- 全体 = 店舗 + イベント + 臨時。臨時 = 臨時の行の合計 + 前受金の動き（入金は＋、取り崩し・返金は−）
- 利益にならない出金・入金（工事・備品・借入と返済・役員との貸し借り）はカードの数字に入れない。表では「臨時」の札
- 切り替えは `scope=all|store|event`（既定 `all`）。臨時は選択肢にしない
- 「経理で見る」の表には見込みの費用の行を出さない
- 札の表示: 店舗＝`regular`、イベント＝`event`、臨時＝`irregular`
- `lib/keiri/` の純粋な関数は実行時に他のファイルを import しない（型だけ `import type`）
- 画面の文言は日本語。金額は `¥1,234`、マイナスは `−¥1,234`
- 経理の部品（`components/keiri/`）のクラス名は全体の CSS と被らせない（`lib/keiri/styles.test.ts` が見張る）
- dev server は立てない。確かめは `npm test`・`npm run build`、最後に本番
- コミットは `sync`。main への反映は坂本さんが「main に反映」と言ってから

## Review Focus

- 前の月に計上して今月払った取引の行 → その取引の月の振り分けで札が付く（今月の行に無いからといって「臨時」にならない）（Task 1 の `rowBucket` テスト、Task 3 で前の月の取引も `bucketsForSources` に渡す）
- クラファンの前受金を売上に振り替えた月 → 全体に二重に入らず、店舗の売上も膨らまない（Task 1 の `buildLines` テスト）
- 経理画面で取引の行の札を付け替えた → カードの数字と月次レポートも動く（Task 1 の `overrideKeysForRow` テスト、Task 5 の本番確認）
- イベントも前受金も無い月 → カードは ¥0 で出て、壊れない（Task 1 の `scopeTotals` テスト）
- 「イベント」で絞ったとき、Square の入金に混ざったイベントのレジ売上は表に出ない → 表の上に一行の注意（Task 4）

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `lib/keiri/buckets.ts`（新規） | 純粋: 振り分けの決まり、行づくり（`buildLines`）、4つの数字、表の行の札、付け替えの鍵 |
| `lib/keiri/buckets.test.ts`（新規） | 上のテスト |
| `lib/monthlyReport.ts` | `buildLines` を使う。`scopes` を返す。`final = scopes.total`。`bucketsForSources` を足す |
| `lib/squareEvents.ts`（新規） | Square のイベント時間帯の売上を取る（今 `/api/monthly-report` にある取り方を移す） |
| `app/api/monthly-report/route.ts` | `squareEvents.ts` を使う |
| `app/monthly/page.tsx` | ③の説明と前受金の注記 |
| `app/api/keiri/monthly/route.ts` | `scopes`・`rowBuckets`・`rowOverrideKeys`・`plScope` を返す |
| `app/api/keiri/bucket/route.ts`（新規） | 札の付け替え |
| `components/keiri/KeiriMonthly.tsx` | 切り替え・カード・件数の小さな表示 |
| `components/keiri/ScopeCards.tsx`（新規） | 4つのカード |
| `components/keiri/BucketMenu.tsx`（新規） | 札の付け替えのメニュー |
| `components/keiri/KeiriSheet.tsx` | 「区分」の列 |
| `components/keiri/PlTable.tsx` | 全体の下の足し引きの行 |
| `components/keiri/ScopePl.tsx`（新規） | 店舗だけ・イベントの「会計で見る」 |

---

### Task 1: 振り分けと4つの数字（純粋な関数）

**Files:**
- Create: `lib/keiri/buckets.ts`、`lib/keiri/buckets.test.ts`

**Interfaces:**
- Produces:
  - `type Bucket = "regular" | "event" | "irregular"`、`type Scope = "all" | "store" | "event"`、`isScope(s: string): s is Scope`、`SCOPE_BUCKET: Record<Scope, Bucket | null>`（all→null、store→"regular"、event→"event"）
  - `type Detail = { entry_side?: "credit" | "debit"; account_item_id: number; amount: number; description?: string | null }`
  - `type AccountLike = { name: string; account_category?: string; categories?: string[] }`
  - `type Line`（今の `lib/monthlyReport.ts` の `Line` をそのまま移す）、`type OffBookEntry = { date: string; label: string; amount: number }`（amount は＋が入金、−が取り崩し・返金）
  - `type Scopes = { store: number; event: number; irregular: number; total: number }`
  - `classify(x: { account: string; description: string; tags: string[]; date: string; eventDays: ReadonlySet<string>; fromAdvance: boolean }): { auto: Bucket; reason: string }`（今の `push` の中の決まりに、最初の決まり「`fromAdvance` なら臨時・理由『前受金からの振り替え』」を足す）
  - `buildLines(x: { deals: { id: number; issue_date: string; type?: "income" | "expense"; details: Detail[] }[]; journals: { id: number; issue_date: string; details: Detail[] }[]; accounts: Map<number, AccountLike>; tagOf: (sourceId: number, amount: number) => string[]; overrides: Record<string, Bucket>; eventDays: ReadonlySet<string> }): { lines: Line[]; offBook: OffBookEntry[] }`（今の `buildMonthly` の行づくり。前受金は貸方を＋、借方を−で `offBook` に入れる。明細に前受金の借方がある取引・振替伝票の損益の行は `fromAdvance: true`）
  - `PL_CATEGORIES`・`IRREGULAR_ACCOUNTS`・`IRREGULAR_TAGS`・`LABOR_ACCOUNTS`（`lib/monthlyReport.ts` から移す）
  - `scopeTotals(lines: { bucket: Bucket; amount: number }[], offBook: { amount: number }[]): Scopes`（四捨五入）
  - `sourceBucket(lines: { bucket: Bucket; amount: number }[]): Bucket | null`（金額の絶対値がいちばん大きい行の区分。空なら null）
  - `rowBucket(row: { key: string; dealId?: number; journalId?: number }, sources: Map<string, Bucket>, overrides: Record<string, Bucket>): Bucket`
  - `overrideKeysForRow(row: { key: string; dealId?: number; journalId?: number }, sources: Map<string, Bucket>, detailCounts: Map<string, number>): string[]`

- [ ] **Step 1: 失敗するテストを書く**（`lib/keiri/buckets.test.ts`）

```ts
const PL = { account_category: "売上高" };
const accounts = new Map<number, AccountLike>([
  [1, { name: "売上高", ...PL }],
  [2, { name: "前受金", account_category: "流動負債" }],
  [3, { name: "消耗品費", account_category: "販売管理費" }],
  [4, { name: "普通預金", account_category: "現金・預金" }],
  [5, { name: "雑収入", account_category: "営業外収益" }],
]);
const none = { tagOf: () => [], overrides: {}, eventDays: new Set<string>() };

test("前受金の入金は＋、売上への振り替えは−。振り替えの売上の行は臨時なので全体に二重に入らない", () => {
  const sep = buildLines({ ...none, accounts, deals: [{ id: 10, issue_date: "2026-09-30", type: "income", details: [{ account_item_id: 2, amount: 508735, entry_side: "credit", description: "CAMPFIRE" }] }], journals: [] });
  assert.deepEqual(sep.offBook.map((o) => o.amount), [508735]);
  assert.equal(scopeTotals(sep.lines, sep.offBook).total, 508735);
  const nov = buildLines({ ...none, accounts, deals: [], journals: [{ id: 20, issue_date: "2026-11-30", details: [
    { account_item_id: 2, amount: 508735, entry_side: "debit" },
    { account_item_id: 1, amount: 508735, entry_side: "credit", description: "クラファン リターン発送" },
  ] }] });
  assert.deepEqual(nov.offBook.map((o) => o.amount), [-508735]);
  assert.equal(nov.lines[0].bucket, "irregular");
  assert.deepEqual(scopeTotals(nov.lines, nov.offBook), { store: 0, event: 0, irregular: 0, total: 0 });
});

test("損益でない科目（普通預金）は行にならない。雑収入は臨時", () => {
  const r = buildLines({ ...none, accounts, deals: [{ id: 30, issue_date: "2026-09-01", type: "income", details: [{ account_item_id: 5, amount: 10396, entry_side: "credit" }, { account_item_id: 4, amount: 10396, entry_side: "debit" }] }], journals: [] });
  assert.deepEqual(r.lines.map((l) => [l.account, l.bucket]), [["雑収入", "irregular"]]);
});

test("4つの数字。何も無い月は全部0", () => {
  const lines = [
    { bucket: "regular" as const, amount: 554263 }, { bucket: "regular" as const, amount: -727384 },
    { bucket: "event" as const, amount: 121976 }, { bucket: "irregular" as const, amount: -187256 },
  ];
  assert.deepEqual(scopeTotals(lines, [{ amount: 508735 }]), { store: -173121, event: 121976, irregular: 321479, total: 270334 });
  assert.deepEqual(scopeTotals([], []), { store: 0, event: 0, irregular: 0, total: 0 });
});

test("取引の区分は金額の大きい行。表の行の札: 取引の区分 → 損益の無い取引は臨時 → 結びつかない行は店舗。付け替えが勝つ", () => {
  assert.equal(sourceBucket([{ bucket: "regular", amount: -1000 }, { bucket: "event", amount: -30000 }]), "event");
  assert.equal(sourceBucket([]), null);
  const sources = new Map<string, Bucket>([["deal:1", "event"]]);
  assert.equal(rowBucket({ key: "w1", dealId: 1 }, sources, {}), "event"); // 前の月の取引でも sources にあれば
  assert.equal(rowBucket({ key: "w2", dealId: 2 }, sources, {}), "irregular"); // 工事・返済など
  assert.equal(rowBucket({ key: "w3" }, sources, {}), "regular"); // Square の入金など
  assert.equal(rowBucket({ key: "w3" }, sources, { "row:w3": "event" }), "event");
  assert.equal(rowBucket({ key: "w2", journalId: 9 }, sources, { "row:w2": "regular" }), "regular");
});

test("付け替えの鍵: 損益のある取引は月次レポートと同じ明細の鍵（全部の明細）、それ以外は行の鍵", () => {
  const sources = new Map<string, Bucket>([["deal:1", "regular"]]);
  const counts = new Map([["deal:1", 3]]);
  assert.deepEqual(overrideKeysForRow({ key: "w1", dealId: 1 }, sources, counts), ["deal:1:0", "deal:1:1", "deal:1:2"]);
  assert.deepEqual(overrideKeysForRow({ key: "w2", dealId: 2 }, sources, counts), ["row:w2"]);
  assert.deepEqual(overrideKeysForRow({ key: "w3" }, sources, counts), ["row:w3"]);
});

test("イベント日の支払報酬はイベント、摘要に返金は臨時、タグ「店舗備品」は臨時（今の決まりのまま）", () => {
  const ev = new Set(["2026-09-22"]);
  assert.equal(classify({ account: "支払報酬", description: "", tags: [], date: "2026-09-22", eventDays: ev, fromAdvance: false }).auto, "event");
  assert.equal(classify({ account: "消耗品費", description: "Amazon 返金", tags: [], date: "2026-09-02", eventDays: ev, fromAdvance: false }).auto, "irregular");
  assert.equal(classify({ account: "消耗品費", description: "", tags: ["店舗備品"], date: "2026-09-02", eventDays: ev, fromAdvance: false }).auto, "irregular");
  assert.equal(classify({ account: "売上高", description: "", tags: [], date: "2026-09-02", eventDays: ev, fromAdvance: true }).reason, "前受金からの振り替え");
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test`
Expected: FAIL（`buckets.ts` が無い）

- [ ] **Step 3: `lib/keiri/buckets.ts` を実装する**

`buildLines` は今の `buildMonthly` の `push` と、取引・振替伝票のループを移したもの（イベントの Square 売上の移し替えと見込みの行は `buildMonthly` に残す）。`fromAdvance` は「その取引・振替伝票の明細に、前受金の借方があるか」。

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test`
Expected: PASS（既存のテストも全部）

- [ ] **Step 5: コミット**

```bash
git add lib/keiri/buckets.ts lib/keiri/buckets.test.ts
git commit -m "feat(keiri-scope): 振り分けと4つの数字を純粋な関数に"
```

---

### Task 2: 月次レポートを共通の計算に載せ替える

**Files:**
- Modify: `lib/monthlyReport.ts`、`app/api/monthly-report/route.ts`、`app/monthly/page.tsx`
- Create: `lib/squareEvents.ts`

**Interfaces:**
- Consumes: Task 1 のすべて
- Produces:
  - `buildMonthly(month, squareEvents, src?)` の戻り値に `scopes: Scopes` を足す。`final = scopes.total`。`offBook` は符号付き。`Bucket`・`Line` は `lib/keiri/buckets.ts` から再 export
  - `bucketsForSources(deals: FreeeDeal[], journals: FreeeJournal[], src: FreeeSource): Promise<{ sources: Map<string, Bucket>; detailCounts: Map<string, number> }>`（`buildLines` を、月で区切らない全イベント日・今の付け替え・領収書のタグで回し、`deal:{id}`・`journal:{id}` ごとに `sourceBucket` でまとめる。`detailCounts` は明細の数）
  - `squareEventSales(origin: string, headers: Record<string, string>, from: string, to: string): Promise<{ events: { label: string; sales: number }[]; analytics: unknown | null }>`（`lib/squareEvents.ts`。今の `/api/monthly-report` の取り方をそのまま移す。取れなければ `events: []`）

- [ ] **Step 1: 載せ替える**

`buildMonthly` の行づくりを `buildLines` の呼び出しに置き換え、4つの数字は `scopeTotals(lines, offBook)`。`regular.profit` などの既存の値は今の計算のまま残す（`scopes.store` と同じ値になる）。`/api/monthly-report` は `squareEventSales` を使う。

- [ ] **Step 2: 月次レポートの画面の文言**

③「この月の成績」の説明を「店舗とイベントと臨時（クラファンや補助金などの一度きりの収入・支出）を合わせた結果」に。欄外の前受金の一覧に「③に含めています」を足す。前受金の取り崩し（−）があれば「−¥…（売上への振り替え）」と出す。

- [ ] **Step 3: 確かめる**

Run: `npm test && npm run build`
Expected: どちらも成功

- [ ] **Step 4: コミット**

```bash
git add lib/monthlyReport.ts lib/squareEvents.ts app/api/monthly-report app/monthly/page.tsx
git commit -m "feat(keiri-scope): 月次レポートを共通の振り分けと4つの数字に載せ替える"
```

---

### Task 3: 経理画面の API に4つの数字・札・会計の範囲を足す

**Files:**
- Modify: `app/api/keiri/monthly/route.ts`
- Create: `app/api/keiri/bucket/route.ts`

**Interfaces:**
- Consumes: `buildMonthly`・`bucketsForSources`・`squareEventSales`（Task 2）、`rowBucket`・`overrideKeysForRow`（Task 1）
- Produces（`KeiriMonthlyResponse` に足す）:
  - `scopes?: Scopes`、`advanceIn?: number`（その月の前受金の入金の合計。カードの「クラファン入金 +¥… を含む」用）
  - cash のとき: `rowBuckets?: Record<string, Bucket>`、`rowOverrideKeys?: Record<string, string[]>`、`rowAuto?: Record<string, boolean>`（付け替えていなければ true）
  - pl のとき: `plScope?: { estimatesTotal: number; advanceTotal: number; store: MonthlyData["regular"]; event: { account: string; amount: number }[]; eventLabels: string[] }`
  - `PUT /api/keiri/bucket` body `{ keys: string[]; bucket: Bucket | null }` → 各 key に `setOverride`。key は `/^(deal|journal):\d+:\d+$/` か `/^row:[\w-]+$/` だけ受ける（それ以外は 400）。返す `{ ok: true }`

- [ ] **Step 1: 実装する**

- `buildMonthly(month, (await squareEventSales(origin, passAuth(req), p.from, p.to)).events, src)` で `scopes`・`offBook`・`lines` を得る（cash・pl のどちらでも）
- cash: 表に出る行の取引（`deals` は今と同じく計上日が3か月前から）と振替伝票を `bucketsForSources` に渡し、各行に `rowBucket`・`overrideKeysForRow` を付ける。`rowAuto` は `overrides` に `row:`／取引の明細の鍵が無いか
- pl: `estimatesTotal` は `lines` のうち `source === "estimate"` の合計の符号を反転したもの、`advanceTotal` は `offBook` の合計、`event` は `bucket === "event"` の行を科目でまとめたもの

- [ ] **Step 2: 確かめる**

Run: `npm test && npm run build`
Expected: どちらも成功。build の出力に `/api/keiri/bucket` が出る

- [ ] **Step 3: コミット**

```bash
git add app/api/keiri/monthly app/api/keiri/bucket
git commit -m "feat(keiri-scope): 経理画面の API に4つの数字と行の区分"
```

---

### Task 4: 経理画面の切り替え・カード・区分の列

**Files:**
- Modify: `components/keiri/KeiriMonthly.tsx`、`components/keiri/KeiriSheet.tsx`、`components/keiri/PlTable.tsx`
- Create: `components/keiri/ScopeCards.tsx`、`components/keiri/BucketMenu.tsx`、`components/keiri/ScopePl.tsx`

**Interfaces:**
- Consumes: Task 3 の応答、`SCOPE_BUCKET`・`isScope`（Task 1）
- Produces: `ScopeCards({ scopes, advanceIn, scope })`、`BucketMenu({ title, bucket, auto, at, onSave, onClose })`（`onSave(bucket: Bucket | null)` は失敗で throw）、`ScopePl({ scope, plScope })`

見た目は `impeccable` で今の経理画面（`.views` の切り替え、`.kpis` のカード、`.warn` の帯、`RowMarkMenu` のメニュー）に合わせる。

- [ ] **Step 1: 作る**

- 切り替え「全体・店舗だけ・イベント」を見出しの右に。URL の `scope` に持ち、`go()` で月・見方と一緒に保つ
- `ScopeCards`: 店舗（通常営業）／イベント／臨時（`advanceIn` が 0 でなければ「クラファン入金 +¥… を含む」）／全体の結果。選んでいる範囲のカードを太い枠に（全体なら全体のカード）
- 今の5つのカードはやめ、「領収書なし N件」「未処理 N件」を道具の帯に小さく出す（`filter.missingOnly`・`todoOnly` のチェックの横）
- 表: 「区分」の列（科目の右）。札を押すと `BucketMenu`（店舗・イベント・臨時・自動に戻す）。保存は `PUT /api/keiri/bucket` に `rowOverrideKeys[row.key]` を送り、終わったら読み直す。前の月の取引の行なら、メニューに「{M}月の数字が変わります」と出す
- scope が store / event のとき、`SCOPE_BUCKET` の区分の行だけ表に出す（`buildSheet` に渡す前に絞る）。event のときは表の上に「イベントのレジ売上は Square の入金に含まれるため、この表では店舗に入っています」
- 会計で見る: all は今の `PlTable` の最後に「見込みの費用（freee 未計上）−¥…」「前受金の入金（クラファンなど）＋¥…」「全体の結果」の3行を足す（全体の結果はカードと同じ値）。store / event は `ScopePl`（店舗は `plScope.store` の売上の内訳・原価と原価率・費用の科目別・人件費前・人件費・結果、イベントは `eventLabels` と科目別と結果）

- [ ] **Step 2: 確かめる**

Run: `npm test && npm run build && /Users/sakamototatsurou/.claude/skills/impeccable/scripts/impeccable detect --json components/keiri/ScopeCards.tsx components/keiri/BucketMenu.tsx components/keiri/ScopePl.tsx components/keiri/KeiriSheet.tsx`
Expected: テスト（styles.test を含む）PASS、build 成功、検出 `[]`

- [ ] **Step 3: コミット**

```bash
git add components/keiri
git commit -m "feat(keiri-scope): 全体・店舗・イベントの切り替えと区分の列"
```

---

### Task 5: 本番で確かめる

- [ ] **Step 1:** 坂本さんに「main に反映していいか」を聞き、了承後に `sync` を main へ早送りして push
- [ ] **Step 2:** 2026-08・09・10 で、`/api/keiri/monthly?view=cash` の `scopes` と `/api/monthly-report` の `scopes`・`final` が一致すること。9月は 店舗 −¥173,121／イベント +¥121,976／臨時 +¥321,479／全体 +¥270,334（見込みの設定と付け替えが 10/18 から変わっていなければ）
- [ ] **Step 3:** 画面で、切り替え・カード・区分の列・「イベント」の注意・会計で見るの3つの範囲を目で確かめる。ある行の札を付け替えて、カードと月次レポートの数字が動き、元に戻せること（試したら自動に戻す）
- [ ] **Step 4:** 崩れがあれば `getComputedStyle` で原因を確かめて直す（styled-jsx の落とし穴）
