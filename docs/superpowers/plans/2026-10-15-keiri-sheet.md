# 経理画面の別レイアウトと月次のエクセル風の表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 経理の15ページを左のサイドバーの専用レイアウトに移し、月次の「経理で見る」を、区切りと小計のある1行＝1件の表にする。表には絞り込み・印刷・行の色とメモ・経理メモ（申し送り）を付ける。

**Architecture:** 経理のページを Next.js のルートグループ `app/(keiri)/` に移し、`app/(keiri)/layout.tsx` がサイドバー（`KeiriShell`）で包む（URLは変わらない）。表の組み立て（区切り・小計・絞り込み）と、色・メモ・経理メモの決まりは `lib/keiri/` の純粋な関数にして `node --test` で確かめる。色・メモ・経理メモは KV に保存し、月次の API とは別の API で読み書きする。

**Tech Stack:** Next.js 15（App Router・ルートグループ）、React 19、TypeScript、styled-jsx、Vercel KV（`@vercel/kv`、既存）、`node --test`（Node 24 の型を外して実行する機能）。

**Spec:** `docs/superpowers/specs/2026-10-15-keiri-sheet-design.md`

## Global Constraints

- 画面の文言はすべて日本語。金額は `¥1,234`（`components/keiri/format.ts` の `yen`）
- 既存ページの URL は変えない。ルートグループ `(keiri)` は URL に出ない
- freee には何も書かない（色・メモ・経理メモはシステムの KV だけ）
- KV のキーは `keiri:marks:{YYYY-MM}`（行の色とメモ）と `keiri:memos`（経理メモ）
- 区切りの順は 入金 → カード → 銀行 → 現金 → 立替 → 移動。移動（ATM・預け入れ）は合計に入れない
- 色は なし・黄・桃・水・緑・橙 の6つ
- PC とスマホの境目は幅 900px。PC のサイドバーの幅は 220px
- 月のタブは 2026年6月から今月まで、新しい月が左
- 新しい npm 依存は入れない。dev server は立てない（確認は `npm test`・`npm run build`・本番）
- `lib/keiri/` の純粋な関数は、実行時に他のファイルを import しない（型だけ `import type`）。テストが `.ts` 付きで読み込むため。`lib/keiri/store.ts` だけは KV を読むので例外（テストしない）
- 画面の部品（`.tsx`）はテストの仕組みが無いので、`npm run build`（型チェック込み）と本番で確かめる
- コミットは `sync` ブランチ。本番（`main`）への反映は、坂本さんが「mainに反映」と言ってから
- UI を書くときは `impeccable` スキルの考え方（余白・階層・フォーカス表示・コントラスト）に沿う。ただし色は `globals.css` の変数（`--ink`・`--line`・`--muted`・`--accent` など）を使う

## Review Focus

- 全角で来る明細「ＡＭＡＺＯＮ．ＣＯ．ＪＰ」を、半角小文字の「amazon」で検索する → その行が出る（Task 2 のテスト）
- 同じ月に ATM の出金と現金の預け入れがある → 移動の区切りに両方出て、入金計・出金計には入らない（Task 2 のテスト）
- 絞り込みで1件も合わない → 区切りは出ず、合計は0。画面は「条件に合う行はありません」（Task 2 のテスト、Task 6 の画面）
- 12月に書いた経理メモ → 翌年1月を開いても出る（年をまたいだ比較。Task 4 のテスト）
- 色を「なし」、メモを空白だけにして保存する → その行の印が消え、空の印が KV に残らない（Task 4 のテスト）

---

## ファイル構成

| ファイル | 役割 | Task |
|---|---|---|
| `lib/keiri/types.ts` | `CashRow` の `detail`・`processed` を `account`・`description`・`status` に分ける | 1 |
| `lib/keiri/cashflow.ts`, `cashflow.test.ts` | 行を作るときに科目・摘要・状態を別々に入れる | 1 |
| `lib/keiri/linkReceipts.ts`, `linkReceipts.test.ts` | Amazon の注文番号を `description` から探す | 1 |
| `components/keiri/CashTable.tsx` | Task 6 で消すまでの間、新しい項目で表示する | 1 |
| `lib/keiri/sheet.ts`, `sheet.test.ts` | 区切りと小計・合計、絞り込み、月のタブ | 2 |
| `lib/keiri/nav.ts`, `nav.test.ts` | サイドバーの分野と並び、`/receipts` をタブに、ページ名 | 3 |
| `lib/keiri/notes.ts`, `notes.test.ts` | 行の色とメモ、経理メモの決まり | 4 |
| `lib/keiri/store.ts` | KV の読み書き | 4 |
| `app/api/keiri/marks/route.ts`, `app/api/keiri/memos/route.ts` | 保存の API | 4 |
| `app/(keiri)/layout.tsx`, `app/(keiri)/*/page.tsx` | 経理のレイアウトと、移した15ページ | 5 |
| `components/keiri/KeiriShell.tsx` | サイドバー・スマホの帯とメニュー | 5 |
| `components/Nav.tsx`, `components/HelpWidget.tsx` | 経理用ナビへの差し替えをやめる／経理ではヘルプを出さない | 5 |
| `components/keiri/KeiriSheet.tsx` | 表 | 6, 7 |
| `components/keiri/KeiriMonthly.tsx` | 月のタブ・数字のカード・道具の帯・表／損益 | 6, 7, 8 |
| `components/keiri/RowMarkMenu.tsx` | 行の色とメモのメニュー | 7 |
| `components/keiri/MemoBoard.tsx` | 経理メモ | 8 |
| `lib/systemGuide.ts` | 使い方チャットの説明 | 8 |
| 消す | `components/KeiriNav.tsx`（Task 5）、`components/keiri/CashTable.tsx`（Task 6） | |

作業はすべて `/Users/sakamototatsurou/system`、`sync` ブランチで行う。

---

### Task 1: 行の科目・摘要・freee の状態を別々の項目にする

**Files:**
- Modify: `lib/keiri/types.ts`（`CashRow`）
- Modify: `lib/keiri/cashflow.ts`（全体を置き換え）
- Modify: `lib/keiri/cashflow.test.ts`
- Modify: `lib/keiri/linkReceipts.ts:28`
- Modify: `lib/keiri/linkReceipts.test.ts`
- Modify: `components/keiri/CashTable.tsx:40,49`

**Interfaces:**
- Produces: `RowStatus = "done" | "todo" | "waiting"`。`CashRow` は `detail` と `processed` を持たず、`account: string`・`description: string`・`status: RowStatus` を持つ。`summarize` の `unprocessed` は `status !== "done"` の件数（Task 2・6・7 が使う）

- [ ] **Step 1: テストを新しい項目で書き直す（失敗するテスト）**

`lib/keiri/cashflow.test.ts` の次のテストを、それぞれ下のように直す。

「前の月に計上して今月払った取引も今月の出金に出る」の最後の行:

```ts
  assert.match(v.outflows[0].detail, /旅費交通費/);
```
を
```ts
  assert.equal(v.outflows[0].account, "旅費交通費");
  assert.equal(v.outflows[0].description, "航空券");
```

「現金売上は日ごとにまとめる」の `assert.deepEqual(...)` の後ろに足す:

```ts
  assert.ok(v.inflows.every((r) => r.account === "売上高" && r.status === "done"));
```

「未処理の明細は未処理として数える」:

```ts
  assert.equal(v.outflows[0].processed, false);
```
を
```ts
  assert.equal(v.outflows[0].status, "todo");
  assert.equal(v.outflows[0].description, "");
```

「消込待ちの未決済取引は計上日と金額で紐づけ、『消込待ち』と出す」の後半2行:

```ts
  assert.match(v.outflows[0].detail, /消込待ち/);
  assert.doesNotMatch(v.outflows[0].detail, /まだ登録していない/);
```
を
```ts
  assert.equal(v.outflows[0].status, "waiting");
  assert.equal(v.outflows[0].account, "消耗品費");
  assert.equal(v.outflows[0].description, "手すり（Amazon 注文250-1506470-9347845）");
  assert.equal(v.totals.unprocessed, 1);
```

「未処理の明細は、どの行でも詳細に「未処理」を1回だけ出す（画面では足さない）」は、テストごと次に置き換える:

```ts
test("未処理の明細は、取引や口座振替と突き合っても状態は todo。科目・摘要に状態の文字を入れない", () => {
  const v = buildCash(base({
    walletTxns: [
      txn(40, "2026-10-13", 17057, "Visaデビット利用 AMAZON CO JP 承認番号：1", "expense", 1),
      txn(41, "2026-10-14", 3000, "振込 ニホンセ-フテイ-", "expense", 1),
      txn(42, "2026-10-15", 9000, "ATM セブン銀行", "expense", 1),
    ],
    deals: [expenseDeal(92, "2026-10-14", "2026-10-14", 3000, 6, "棚")],
    transfers: [{ id: 10, date: "2026-10-15", amount: 9000, from_walletable_id: BANK, to_walletable_id: CASH }],
  }));
  for (const id of [40, 41, 42]) {
    const row = v.outflows.find((r) => r.walletTxnId === id);
    assert.equal(row?.status, "todo", `明細${id}`);
    assert.doesNotMatch(`${row?.account}${row?.description}`, /未処理|消込待ち/, `明細${id}`);
  }
  const deal = v.outflows.find((r) => r.walletTxnId === 41);
  assert.deepEqual([deal?.account, deal?.description], ["消耗品費", "棚"]);
  const atm = v.outflows.find((r) => r.walletTxnId === 42);
  assert.deepEqual([atm?.account, atm?.description, atm?.kind], ["", "現金へ移動", "move"]);
});
```

「貸方が普通預金の振替伝票は、日付と金額で口座明細に紐づける」の

```ts
  assert.equal(row.processed, true);
  assert.equal(row.detail, "消耗品費／シンプルストレージ 2コ×単100");
```
を
```ts
  assert.equal(row.status, "done");
  assert.equal(row.account, "消耗品費");
  assert.equal(row.description, "シンプルストレージ 2コ×単100");
```

「普通預金の振替伝票は、金額が違えば紐づけない」の

```ts
  assert.equal(v.outflows[0].processed, false);
```
を
```ts
  assert.equal(v.outflows[0].status, "todo");
```

「現金売上（レジ）は売上高の明細がある取引だけ。…」の

```ts
  assert.match(other?.detail ?? "", /役員貸付金/);
```
を
```ts
  assert.equal(other?.account, "役員貸付金");
  assert.equal(other?.description, "返済（現金）");
```

ファイルの最後に足す:

```ts
test("freeeで処理済みだが、どの取引とも突き合わない明細は、処理済みで摘要に理由を書く", () => {
  const v = buildCash(base({
    walletTxns: [txn(60, "2026-10-16", 4400, "Visaデビット利用 ナゾノミセ 承認番号：1", "expense", 2)],
  }));
  assert.equal(v.outflows[0].status, "done");
  assert.equal(v.outflows[0].account, "");
  assert.equal(v.outflows[0].description, "freeeの取引と突き合わせできませんでした");
  assert.equal(v.totals.unprocessed, 0);
});

test("口座振替の入金は科目なし、摘要に種類", () => {
  const v = buildCash(base({
    walletTxns: [txn(61, "2026-10-02", 140669, "振込 PAYPAY", "income")],
    transfers: [{ id: 11, date: "2026-10-02", amount: 140669, from_walletable_id: SQ_OTHER, to_walletable_id: BANK }],
  }));
  assert.deepEqual(
    [v.inflows[0].account, v.inflows[0].description, v.inflows[0].kind, v.inflows[0].status],
    ["", "売上金（PayPayなど・Square経由）", "sales", "done"],
  );
});
```

`lib/keiri/linkReceipts.test.ts` の `row` を次に置き換える:

```ts
const row = (over: Partial<CashRow>): CashRow => ({
  key: "k", date: "2026-10-11", amount: 1000, title: "t", account: "消耗品費", description: "", kind: "expense", tag: "card", status: "done", ...over,
});
```

同じファイルの「Amazonは注文番号で確認する」の1行目を次に置き換える:

```ts
  const [r] = attachReceipts([row({ dealId: 9, description: "手すり（Amazon 注文250-1506470-9347845）" })], [], []);
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npm test 2>&1 | grep -E "^✖|ℹ (pass|fail)"`
Expected: FAIL。`account`・`description`・`status` が `undefined` になって複数のテストが落ちる（型を外して実行するので、型の誤りではなく値の違いで落ちる）

- [ ] **Step 3: 型を直す**

`lib/keiri/types.ts` の `ReceiptStatus` の行から `CashRow` の終わりまでを次に置き換える:

```ts
export type ReceiptStatus = "attached" | "amazon" | "missing" | "missing-recorded" | "n/a";
/** freeeでの状態。done = 処理済み、todo = 明細が未処理、waiting = 未決済の取引に当たったが消込前 */
export type RowStatus = "done" | "todo" | "waiting";
export type CashRow = {
  key: string;
  date: string;
  amount: number;
  title: string; // 明細の文字・店名・振込先など
  account: string; // 科目（複数は「・」）。無ければ ""
  description: string; // 摘要。口座振替などは「現金へ移動」のような種類。無ければ ""
  kind: "sales" | "other" | "expense" | "move"; // move = 口座⇄現金の移動（合計に入れない）
  tag?: PayTag; // 出金だけ
  status: RowStatus;
  partner?: string;
  dealId?: number;
  journalId?: number;
  walletTxnId?: number;
  receipt?: { id: string; vendor: string };
  amazonOrderId?: string;
  receiptStatus?: ReceiptStatus;
};
```

- [ ] **Step 4: `lib/keiri/cashflow.ts` を置き換える**

```ts
// 「経理で見る」の行を作る。普通預金の明細を起点に、freeeの取引・口座振替と突き合わせ、
// 現金売上（Squareの現金分）と、現金払い・立替の振替伝票を足して、日付順に並べる。
// freeeのAPIは明細と取引の対応を返さないので、取引の支払い（口座・日付・金額）で突き合わせる。
// 科目・摘要・freeeでの状態は別々の項目で返す（表の列に分けて出す。状態を文字にするのは画面の役目）。
import type {
  CashInput,
  CashRow,
  CashTotals,
  CashView,
  FreeeDeal,
  FreeeJournal,
  FreeePayment,
  FreeeTransfer,
  PayTag,
  RowStatus,
} from "./types";

const SALES_ACCOUNTS = ["売上高", "売掛金"];

export function cleanBankText(s: string): string {
  return s
    .replace(/^Visaデビット利用\s*/, "")
    .replace(/\s*承認番号[:：].*$/, "")
    .replace(/[\s　]+/g, " ")
    .trim();
}

const inMonth = (d: string, m: { from: string; to: string }) => d >= m.from && d <= m.to;
const isCard = (desc: string) => desc.startsWith("Visaデビット");
const byDate = (a: CashRow, b: CashRow) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key);

type Parts = { accounts: string[]; account: string; description: string };

function dealParts(deal: FreeeDeal, names: Map<number, string>): Parts {
  const accounts = [...new Set(deal.details.map((d) => names.get(d.account_item_id) ?? "不明"))];
  const description = deal.details.map((d) => d.description).find((x) => !!x) ?? "";
  return { accounts, account: accounts.join("・"), description };
}

function journalParts(j: FreeeJournal, names: Map<number, string>): Parts {
  const debits = j.details.filter((d) => d.entry_side === "debit");
  const accounts = [...new Set(debits.map((d) => names.get(d.account_item_id) ?? "不明"))];
  const description = [...debits, ...j.details].map((d) => d.description).find((x) => !!x) ?? "";
  return { accounts, account: accounts.join("・"), description };
}

export function summarize(inflows: CashRow[], outflows: CashRow[]): CashTotals {
  const sum = (rows: CashRow[]) => rows.filter((r) => r.kind !== "move").reduce((s, r) => s + r.amount, 0);
  const inSum = sum(inflows);
  const outSum = sum(outflows);
  return {
    in: inSum,
    out: outSum,
    net: inSum - outSum,
    missingReceipts: outflows.filter((r) => r.receiptStatus === "missing" || r.receiptStatus === "missing-recorded").length,
    unprocessed: [...inflows, ...outflows].filter((r) => r.status !== "done").length,
  };
}

export function buildCash(input: CashInput): CashView {
  const { month, accountNames: names } = input;

  // 取引の支払いを「口座|日付|金額」で引けるようにする（同じキーが複数あれば先に見つかった順に使う）
  const pays = new Map<string, { deal: FreeeDeal; payment: FreeePayment }[]>();
  for (const deal of input.deals) {
    for (const p of deal.payments ?? []) {
      if (!inMonth(p.date, month)) continue;
      const k = `${p.from_walletable_id}|${p.date}|${p.amount}`;
      const list = pays.get(k) ?? [];
      list.push({ deal, payment: p });
      pays.set(k, list);
    }
  }
  const transfers: FreeeTransfer[] = input.transfers.filter((t) => inMonth(t.date, month));
  const takeTransfer = (date: string, amount: number, side: "income" | "expense") => {
    const i = transfers.findIndex(
      (t) =>
        t.date === date &&
        t.amount === amount &&
        (side === "expense" ? t.from_walletable_id === input.bankWalletableId : t.to_walletable_id === input.bankWalletableId),
    );
    return i < 0 ? undefined : transfers.splice(i, 1)[0];
  };

  // 支払いのない未決済の取引（UIで消込する前の状態）。計上日と金額で明細に当てる
  const unsettled = input.deals.filter((d) => d.status !== "settled" && (d.payments ?? []).length === 0);
  const takeUnsettled = (date: string, amount: number, side: "income" | "expense") => {
    const i = unsettled.findIndex(
      (d) => d.type === side && d.issue_date === date && (d.amount ?? d.details.reduce((s, x) => s + x.amount, 0)) === amount,
    );
    return i < 0 ? undefined : unsettled.splice(i, 1)[0];
  };

  // 貸方が普通預金の振替伝票（7〜8月は領収書をこの形で登録していた）。日付と貸方の金額で出金の明細に当てる
  const isBank = (id: number) => input.bankAccountItemId !== undefined && id === input.bankAccountItemId;
  const bankCredit = (j: FreeeJournal, amount?: number) =>
    j.details.some((d) => d.entry_side === "credit" && isBank(d.account_item_id) && (amount === undefined || d.amount === amount));
  const bankJournals = input.journals.filter((j) => inMonth(j.issue_date, month) && bankCredit(j));
  const takeBankJournal = (date: string, amount: number) => {
    const i = bankJournals.findIndex((j) => j.issue_date === date && bankCredit(j, amount));
    return i < 0 ? undefined : bankJournals.splice(i, 1)[0];
  };

  const inflows: CashRow[] = [];
  const outflows: CashRow[] = [];

  // 処理済みの明細から先に突き合わせる（同じ日・同じ金額で片方だけ消込済みのとき、取引を取り違えないため）
  const txns = input.walletTxns
    .filter((t) => inMonth(t.date, month))
    .sort((a, b) => Number(a.status === 1) - Number(b.status === 1));

  for (const t of txns) {
    const status: RowStatus = t.status === 1 ? "todo" : "done";
    const base = {
      key: `w${t.id}`,
      date: t.date,
      amount: t.amount,
      title: cleanBankText(t.description),
      walletTxnId: t.id,
      status,
    };
    const tag: PayTag = isCard(t.description) ? "card" : "bank";
    // 取引に紐づかない行（口座振替など）。科目は無く、摘要に種類を書く
    const plain = (description: string) => ({ ...base, account: "", description });

    const pushDeal = (deal: FreeeDeal, rowStatus: RowStatus = status) => {
      const parts = dealParts(deal, names);
      const partner = deal.partner_id ? input.partnerNames.get(deal.partner_id) : undefined;
      const row = { ...base, account: parts.account, description: parts.description, status: rowStatus, partner, dealId: deal.id };
      if (t.entry_side === "income") {
        inflows.push({ ...row, kind: parts.accounts.some((a) => SALES_ACCOUNTS.includes(a)) ? "sales" : "other" });
      } else {
        outflows.push({ ...row, kind: "expense", tag });
      }
    };
    const takePay = () => pays.get(`${input.bankWalletableId}|${t.date}|${t.amount}`)?.shift();

    // カード払いは取引とだけ照合する。カード以外（ATM・振込）は口座振替を先に試す
    const tr = tag === "card" ? undefined : takeTransfer(t.date, t.amount, t.entry_side);
    if (tr) {
      if (t.entry_side === "income") {
        if (tr.from_walletable_id === input.squareOtherWalletableId) {
          inflows.push({ ...plain("売上金（PayPayなど・Square経由）"), kind: "sales" });
        } else if (tr.from_walletable_id === input.cashWalletableId) {
          inflows.push({ ...plain("現金の預け入れ"), kind: "move" });
        } else {
          inflows.push({ ...plain("口座振替"), kind: "other" });
        }
      } else {
        const toCash = tr.to_walletable_id === input.cashWalletableId;
        outflows.push({ ...plain(toCash ? "現金へ移動" : "口座振替"), kind: toCash ? "move" : "expense", tag: "bank" });
      }
      continue;
    }

    const ref = takePay();
    if (ref) {
      pushDeal(ref.deal);
      continue;
    }

    // 振替伝票で帳簿に載っているので、freeeの明細が未処理のままでも処理済みとして扱う
    const bj = t.entry_side === "expense" ? takeBankJournal(t.date, t.amount) : undefined;
    if (bj) {
      const parts = journalParts(bj, names);
      outflows.push({ ...base, account: parts.account, description: parts.description, kind: "expense", tag, status: "done", journalId: bj.id });
      continue;
    }

    const waiting = t.status === 1 ? takeUnsettled(t.date, t.amount, t.entry_side) : undefined;
    if (waiting) {
      pushDeal(waiting, "waiting");
      continue;
    }

    // どの取引とも突き合わない。未処理なら状態で分かるので摘要は空、処理済みなら理由を書く
    const row = plain(t.status === 1 ? "" : "freeeの取引と突き合わせできませんでした");
    if (t.entry_side === "income") inflows.push({ ...row, kind: "other" });
    else outflows.push({ ...row, kind: "expense", tag });
  }

  // 現金の動き: Square連携の売上取引（売上高の明細がある取引）の現金分は日ごとに合計。
  // それ以外の現金の入金と、現金で払った支出の取引はそのまま1行ずつ
  const cashSales = new Map<string, number>();
  for (const deal of input.deals) {
    const squareSale = deal.type === "income" && deal.details.some((d) => names.get(d.account_item_id) === "売上高");
    for (const [pi, pay] of (deal.payments ?? []).entries()) {
      if (pay.from_walletable_id !== input.cashWalletableId || !inMonth(pay.date, month)) continue;
      if (squareSale) {
        cashSales.set(pay.date, (cashSales.get(pay.date) ?? 0) + pay.amount);
        continue;
      }
      const parts = dealParts(deal, names);
      const partner = deal.partner_id ? input.partnerNames.get(deal.partner_id) : undefined;
      const row = {
        key: `d${deal.id}-p${pi}`,
        date: pay.date,
        amount: pay.amount,
        title: partner ?? (parts.description || parts.account),
        account: parts.account,
        description: parts.description,
        status: "done" as const,
        partner,
        dealId: deal.id,
      };
      if (deal.type === "income") {
        inflows.push({ ...row, kind: parts.accounts.some((a) => SALES_ACCOUNTS.includes(a)) ? "sales" : "other" });
      } else {
        outflows.push({ ...row, kind: "expense", tag: "cash" });
      }
    }
  }
  for (const [date, amount] of cashSales) {
    inflows.push({
      key: `cash-${date}`,
      date,
      amount,
      title: "現金売上（レジ）",
      account: "売上高",
      description: "Square連携の売上のうち現金で受け取った分",
      kind: "sales",
      status: "done",
    });
  }

  // 振替伝票: 銀行が出てくる伝票は明細の側で数えるので除く。
  // 借方が現金 → 現金が入ってくる（貸方が売上高なら売上金）。貸方が現金 → 現金払い、役員借入金 → 立替
  for (const j of input.journals) {
    if (!inMonth(j.issue_date, month)) continue;
    if (j.details.some((d) => isBank(d.account_item_id))) continue;
    const debits = j.details.filter((d) => d.entry_side === "debit");
    const credits = j.details.filter((d) => d.entry_side === "credit");
    const nameOf = (id: number) => names.get(id) ?? "不明";
    const firstDesc = j.details.map((d) => d.description).find((x) => !!x) ?? "";

    const cashIn = debits.filter((d) => nameOf(d.account_item_id) === "現金");
    if (cashIn.length > 0) {
      const from = [...new Set(credits.map((c) => nameOf(c.account_item_id)))];
      inflows.push({
        key: `j${j.id}-in`,
        date: j.issue_date,
        amount: cashIn.reduce((s, d) => s + d.amount, 0),
        title: firstDesc || from.join("・"),
        account: from.join("・"),
        description: firstDesc,
        kind: from.some((a) => SALES_ACCOUNTS.includes(a)) ? "sales" : "other",
        status: "done",
        journalId: j.id,
      });
      continue;
    }

    const accounts = [...new Set(debits.map((d) => nameOf(d.account_item_id)))];
    for (const [ci, c] of credits.entries()) {
      const credit = nameOf(c.account_item_id);
      const tag: PayTag | undefined = credit === "現金" ? "cash" : credit === "役員借入金" ? "tatekae" : undefined;
      if (!tag) continue;
      const desc = c.description || debits.map((d) => d.description).find((x) => !!x) || "";
      outflows.push({
        key: `j${j.id}-c${ci}`,
        date: j.issue_date,
        amount: c.amount,
        title: desc || accounts.join("・"),
        account: accounts.join("・"),
        description: desc,
        kind: "expense",
        tag,
        status: "done",
        journalId: j.id,
      });
    }
  }

  inflows.sort(byDate);
  outflows.sort(byDate);
  return { inflows, outflows, totals: summarize(inflows, outflows) };
}
```

- [ ] **Step 5: Amazon の注文番号を摘要から探す**

`lib/keiri/linkReceipts.ts` の

```ts
    const order = AMAZON_ORDER.exec(row.detail);
```
を
```ts
    const order = AMAZON_ORDER.exec(row.description);
```

- [ ] **Step 6: Task 6 で消すまでの間、今のカード型の一覧を新しい項目で出す**

`components/keiri/CashTable.tsx` の

```tsx
        <li key={r.key} className={`${r.kind === "move" ? "move" : ""} ${r.processed ? "" : "todo"}`}>
```
を
```tsx
        <li key={r.key} className={`${r.kind === "move" ? "move" : ""} ${r.status === "done" ? "" : "todo"}`}>
```

同じファイルの

```tsx
            <span className="detail">{r.detail}</span>
```
を
```tsx
            <span className="detail">
              {[r.account, r.description].filter(Boolean).join("／")}
              {r.status === "todo" ? "（未処理）" : r.status === "waiting" ? "（freeeで消込待ち）" : ""}
            </span>
```

- [ ] **Step 7: テストと型チェックが通ることを確かめる**

Run: `npm test 2>&1 | grep -E "^✖|ℹ (pass|fail)"`
Expected: `ℹ fail 0`

Run: `npx tsc --noEmit -p . 2>&1 | head -20`
Expected: 何も出ない（型エラー 0）

- [ ] **Step 8: Commit**

```bash
git add lib/keiri/types.ts lib/keiri/cashflow.ts lib/keiri/cashflow.test.ts lib/keiri/linkReceipts.ts lib/keiri/linkReceipts.test.ts components/keiri/CashTable.tsx
git commit -m "経理の月次: 行の科目・摘要・freeeの状態を別々の項目にする"
```

---

### Task 2: 表の区切り・小計・合計・絞り込み・月のタブ

**Files:**
- Create: `lib/keiri/sheet.ts`
- Test: `lib/keiri/sheet.test.ts`

**Interfaces:**
- Consumes: `CashRow`, `CashView`, `RowStatus`（Task 1）
- Produces:
  - `type Side = "in" | "out"`、`type SectionKey = "in" | "card" | "bank" | "cash" | "tatekae" | "move"`
  - `type SheetRow = CashRow & { side: Side }`
  - `type SheetSection = { key: SectionKey; label: string; rows: SheetRow[]; inSum: number; outSum: number }`
  - `type Sheet = { sections: SheetSection[]; totals: { in: number; out: number; net: number } }`
  - `type SheetFilter = { query: string; missingOnly: boolean; todoOnly: boolean }`、`const NO_FILTER: SheetFilter`
  - `buildSheet(view: Pick<CashView, "inflows" | "outflows">, filter: SheetFilter, notes?: Record<string, string>): Sheet`（`notes` は行の key → 行のメモ。検索の対象）
  - `monthTabs(thisMonth: string, first?: string): string[]`（新しい月が先）

- [ ] **Step 1: 失敗するテストを書く**

`lib/keiri/sheet.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSheet, monthTabs, NO_FILTER } from "./sheet.ts";
import type { CashRow } from "./types.ts";

const row = (over: Partial<CashRow>): CashRow => ({
  key: "k", date: "2026-10-05", amount: 1000, title: "t", account: "", description: "",
  kind: "expense", tag: "card", status: "done", ...over,
});

test("区切りは 入金→カード→銀行→現金→立替→移動 の順。0件の区切りは出さない", () => {
  const s = buildSheet({
    inflows: [row({ key: "i1", kind: "sales", tag: undefined })],
    outflows: [
      row({ key: "t1", tag: "tatekae" }),
      row({ key: "c1", tag: "card" }),
      row({ key: "k1", tag: "cash" }),
    ],
  }, NO_FILTER);
  assert.deepEqual(s.sections.map((x) => [x.key, x.label]), [["in", "入金"], ["card", "カード"], ["cash", "現金"], ["tatekae", "立替"]]);
});

test("移動はATMの出金も預け入れも移動の区切りに出し、入金計・出金計には入れない", () => {
  const s = buildSheet({
    inflows: [
      row({ key: "i1", kind: "sales", tag: undefined, amount: 10000 }),
      row({ key: "dep", kind: "move", tag: undefined, amount: 50000 }),
    ],
    outflows: [
      row({ key: "c1", tag: "card", amount: 3000 }),
      row({ key: "atm", kind: "move", tag: "bank", amount: 9000 }),
    ],
  }, NO_FILTER);
  const move = s.sections.find((x) => x.key === "move");
  assert.deepEqual(move?.rows.map((r) => r.key).sort(), ["atm", "dep"]);
  assert.deepEqual([move?.inSum, move?.outSum], [50000, 9000]);
  assert.equal(s.sections.some((x) => x.key === "bank"), false);
  assert.deepEqual(s.totals, { in: 10000, out: 3000, net: 7000 });
});

test("区切りごとの小計と、区切りの中の日付順", () => {
  const s = buildSheet({
    inflows: [],
    outflows: [
      row({ key: "b", date: "2026-10-20", amount: 300 }),
      row({ key: "a", date: "2026-10-02", amount: 100 }),
    ],
  }, NO_FILTER);
  assert.deepEqual(s.sections[0].rows.map((r) => r.date), ["2026-10-02", "2026-10-20"]);
  assert.deepEqual([s.sections[0].inSum, s.sections[0].outSum], [0, 400]);
  assert.ok(s.sections[0].rows.every((r) => r.side === "out"));
});

test("検索は相手・科目・摘要・メモで探し、全角と半角、大文字と小文字を区別しない", () => {
  const view = {
    inflows: [],
    outflows: [
      row({ key: "amz", title: "ＡＭＡＺＯＮ．ＣＯ．ＪＰ" }),
      row({ key: "acct", title: "x", account: "消耗品費" }),
      row({ key: "memo", title: "y" }),
      row({ key: "other", title: "z", description: "ガソリン" }),
    ],
  };
  const keys = (query: string) =>
    buildSheet(view, { ...NO_FILTER, query }, { memo: "返品予定" }).sections.flatMap((x) => x.rows.map((r) => r.key));
  assert.deepEqual(keys("amazon"), ["amz"]);
  assert.deepEqual(keys("消耗品"), ["acct"]);
  assert.deepEqual(keys("返品"), ["memo"]);
  assert.deepEqual(keys("  ガソリン "), ["other"]);
});

test("「領収書なしだけ」「未処理だけ」で絞り、小計と合計も絞った行で出す", () => {
  const view = {
    inflows: [row({ key: "i", kind: "sales", tag: undefined, amount: 5000, status: "todo" })],
    outflows: [
      row({ key: "miss", amount: 100, receiptStatus: "missing" }),
      row({ key: "rec", amount: 200, receiptStatus: "missing-recorded", status: "waiting" }),
      row({ key: "ok", amount: 400, receiptStatus: "attached" }),
    ],
  };
  const missing = buildSheet(view, { ...NO_FILTER, missingOnly: true });
  assert.deepEqual(missing.sections.flatMap((x) => x.rows.map((r) => r.key)), ["miss", "rec"]);
  assert.deepEqual(missing.totals, { in: 0, out: 300, net: -300 });

  const todo = buildSheet(view, { ...NO_FILTER, todoOnly: true });
  assert.deepEqual(todo.sections.flatMap((x) => x.rows.map((r) => r.key)), ["i", "rec"]);
});

test("条件に合う行が無ければ、区切りは無く合計は0", () => {
  const s = buildSheet({ inflows: [], outflows: [row({ key: "a" })] }, { ...NO_FILTER, query: "存在しない店" });
  assert.deepEqual(s, { sections: [], totals: { in: 0, out: 0, net: 0 } });
});

test("月のタブは2026年6月から今月まで、新しい月が先。年をまたいでも並ぶ", () => {
  assert.deepEqual(monthTabs("2026-10"), ["2026-10", "2026-09", "2026-08", "2026-07", "2026-06"]);
  const next = monthTabs("2027-01");
  assert.deepEqual(next.slice(0, 2), ["2027-01", "2026-12"]);
  assert.equal(next.length, 8);
  assert.deepEqual(monthTabs("2026-06"), ["2026-06"]);
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npm test 2>&1 | grep -E "^✖|ℹ (pass|fail)|sheet"`
Expected: FAIL。`lib/keiri/sheet.test.ts` が「Cannot find module './sheet.ts'」で落ちる

- [ ] **Step 3: `lib/keiri/sheet.ts` を書く**

```ts
// 月次の表（経理で見る）の組み立て。入金・出金の行を区切りに分け、小計と合計を出し、絞り込む。
// 画面（components/keiri/KeiriSheet.tsx・KeiriMonthly.tsx）から使う純粋な関数。
// 実行時に他のファイルを import しない（テストから .ts 付きで読むため。型だけ import type）。
import type { CashRow, CashView } from "./types";

export type Side = "in" | "out";
export type SectionKey = "in" | "card" | "bank" | "cash" | "tatekae" | "move";
export const SECTION_ORDER: readonly SectionKey[] = ["in", "card", "bank", "cash", "tatekae", "move"];
export const SECTION_LABEL: Record<SectionKey, string> = {
  in: "入金",
  card: "カード",
  bank: "銀行",
  cash: "現金",
  tatekae: "立替",
  move: "移動",
};

export type SheetRow = CashRow & { side: Side };
export type SheetSection = { key: SectionKey; label: string; rows: SheetRow[]; inSum: number; outSum: number };
export type SheetTotals = { in: number; out: number; net: number };
export type Sheet = { sections: SheetSection[]; totals: SheetTotals };
export type SheetFilter = { query: string; missingOnly: boolean; todoOnly: boolean };
export const NO_FILTER: SheetFilter = { query: "", missingOnly: false, todoOnly: false };

export function sectionOf(row: CashRow, side: Side): SectionKey {
  if (row.kind === "move") return "move";
  if (side === "in") return "in";
  return row.tag ?? "bank";
}

/** 全角・半角と大文字・小文字の違いを無くす（freeeの明細は「ＡＭＡＺＯＮ．ＣＯ．ＪＰ」のように全角で来る） */
const norm = (s: string) => s.normalize("NFKC").toLowerCase();

export function matchesFilter(row: CashRow, filter: SheetFilter, note = ""): boolean {
  if (filter.missingOnly && row.receiptStatus !== "missing" && row.receiptStatus !== "missing-recorded") return false;
  if (filter.todoOnly && row.status === "done") return false;
  const q = norm(filter.query.trim());
  if (!q) return true;
  return [row.partner ?? "", row.title, row.account, row.description, note].some((s) => norm(s).includes(q));
}

const byDate = (a: SheetRow, b: SheetRow) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key);
const total = (rows: SheetRow[], side: Side) => rows.filter((r) => r.side === side).reduce((s, r) => s + r.amount, 0);

/** notes: 行の key → 行に付けたメモ（検索の対象にする） */
export function buildSheet(
  view: Pick<CashView, "inflows" | "outflows">,
  filter: SheetFilter,
  notes: Record<string, string> = {},
): Sheet {
  const rows: SheetRow[] = [
    ...view.inflows.map((r) => ({ ...r, side: "in" as const })),
    ...view.outflows.map((r) => ({ ...r, side: "out" as const })),
  ].filter((r) => matchesFilter(r, filter, notes[r.key]));

  const sections: SheetSection[] = [];
  for (const key of SECTION_ORDER) {
    const list = rows.filter((r) => sectionOf(r, r.side) === key).sort(byDate);
    if (list.length === 0) continue;
    sections.push({ key, label: SECTION_LABEL[key], rows: list, inSum: total(list, "in"), outSum: total(list, "out") });
  }

  // 移動（口座⇄現金）は合計に入れない
  const counted = rows.filter((r) => r.kind !== "move");
  const inSum = total(counted, "in");
  const outSum = total(counted, "out");
  return { sections, totals: { in: inSum, out: outSum, net: inSum - outSum } };
}

/** 月のタブの最初の月（会計年度の初め・会社設立の月） */
export const FIRST_MONTH = "2026-06";

/** 月のタブに出す月。first から thisMonth まで、新しい月が先 */
export function monthTabs(thisMonth: string, first: string = FIRST_MONTH): string[] {
  const out: string[] = [];
  let y = Number(thisMonth.slice(0, 4));
  let m = Number(thisMonth.slice(5, 7));
  // 万一 first が先の月でも止まるように、20年分で打ち切る
  for (let i = 0; i < 240; i++) {
    const s = `${y}-${String(m).padStart(2, "0")}`;
    if (s < first) break;
    out.push(s);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test 2>&1 | grep -E "^✖|ℹ (pass|fail)"`
Expected: `ℹ fail 0`

- [ ] **Step 5: Commit**

```bash
git add lib/keiri/sheet.ts lib/keiri/sheet.test.ts
git commit -m "経理の月次: 表の区切り・小計・合計・絞り込み・月のタブ"
```

---

### Task 3: サイドバーの分野と並び

**Files:**
- Modify: `lib/keiri/nav.ts`（`KEIRI_TABS` から `isKeiriPath` まで）
- Test: `lib/keiri/nav.test.ts`

**Interfaces:**
- Produces:
  - `type KeiriGroup = "top" | "kiroku" | "shiharai" | "shukei" | "shorui"`、`type KeiriTab = { href: string; label: string; group: KeiriGroup }`
  - `KEIRI_TABS: KeiriTab[]`（15ページ。`/receipts` を含む）
  - `isKeiriPath(path: string): boolean`
  - `keiriMenu(): { key: KeiriGroup; label: string; tabs: KeiriTab[] }[]`（サイドバーの並び）
  - `keiriPageLabel(path: string): string | undefined`（絵文字を除いたページ名）
  - `freeeLinks`・`inflowLabel` は今のまま（`inflowLabel` は Task 6 で消す）

- [ ] **Step 1: 失敗するテストを書く**

`lib/keiri/nav.test.ts` の import を次に置き換える:

```ts
import { freeeLinks, inflowLabel, isKeiriPath, KEIRI_TABS, keiriMenu, keiriPageLabel } from "./nav.ts";
```

テスト「経理ナビを出すページ」を次に置き換える:

```ts
test("経理のレイアウトで出すページ", () => {
  assert.equal(isKeiriPath("/keiri"), true);
  assert.equal(isKeiriPath("/ryoshusho"), true);
  assert.equal(isKeiriPath("/receipts"), true);
  assert.equal(isKeiriPath("/table"), false);
  assert.equal(KEIRI_TABS.length, 15);
});

test("サイドバーの分野と並び", () => {
  const menu = keiriMenu();
  assert.deepEqual(menu.map((g) => g.label), ["", "記録する", "支払い", "集計", "書類"]);
  assert.deepEqual(menu.map((g) => g.tabs.map((t) => t.href)), [
    ["/keiri"],
    ["/ryoshusho", "/receipts", "/meisai", "/pending"],
    ["/kariire", "/payables", "/bills", "/loans"],
    ["/items", "/report"],
    ["/shorui", "/contracts", "/company", "/zeirishi"],
  ]);
});

test("スマホの帯に出すページ名は絵文字を除く", () => {
  assert.equal(keiriPageLabel("/keiri"), "月次");
  assert.equal(keiriPageLabel("/receipts"), "保存済み領収書");
  assert.equal(keiriPageLabel("/zeirishi"), "税理士");
  assert.equal(keiriPageLabel("/table"), undefined);
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npm test 2>&1 | grep -E "^✖|ℹ (pass|fail)"`
Expected: FAIL。`keiriMenu` が無いので `lib/keiri/nav.test.ts` が「does not provide an export named 'keiriMenu'」で落ちる

- [ ] **Step 3: `lib/keiri/nav.ts` を直す**

1行目のコメント・2行目の `import type { CashRow } from "./types";`・`KEIRI_TABS`・`KEIRI_EXTRA_PATHS`・`isKeiriPath` まで（`export function inflowLabel` の手前まで）をまとめて次に置き換える:

```ts
// 経理のページの一覧と、サイドバーでの分野。components/keiri/KeiriShell.tsx・components/HelpWidget.tsx が使う（JSXを含まないのでテストできる）。
import type { CashRow } from "./types";

export type KeiriGroup = "top" | "kiroku" | "shiharai" | "shukei" | "shorui";
export type KeiriTab = { href: string; label: string; group: KeiriGroup };

const GROUP_ORDER: KeiriGroup[] = ["top", "kiroku", "shiharai", "shukei", "shorui"];
const GROUP_LABEL: Record<KeiriGroup, string> = { top: "", kiroku: "記録する", shiharai: "支払い", shukei: "集計", shorui: "書類" };

export const KEIRI_TABS: KeiriTab[] = [
  { href: "/keiri", label: "📅 月次", group: "top" },
  { href: "/ryoshusho", label: "🧾 領収書", group: "kiroku" },
  { href: "/receipts", label: "🗂 保存済み領収書", group: "kiroku" },
  { href: "/meisai", label: "🏦 明細", group: "kiroku" },
  { href: "/pending", label: "⏳ 処理待ち", group: "kiroku" },
  { href: "/kariire", label: "💴 立替", group: "shiharai" },
  { href: "/payables", label: "💰 払うもの", group: "shiharai" },
  { href: "/bills", label: "🔁 定期請求", group: "shiharai" },
  { href: "/loans", label: "🏦 借入返済", group: "shiharai" },
  { href: "/items", label: "🧺 品目台帳", group: "shukei" },
  { href: "/report", label: "📊 用途別", group: "shukei" },
  { href: "/shorui", label: "📄 書類", group: "shorui" },
  { href: "/contracts", label: "📜 契約書", group: "shorui" },
  { href: "/company", label: "🏢 会社書類", group: "shorui" },
  { href: "/zeirishi", label: "🧑‍💼 税理士", group: "shorui" },
];

export function isKeiriPath(path: string): boolean {
  return KEIRI_TABS.some((t) => t.href === path);
}

/** サイドバーの並び。分野の順に、その分野のページ */
export function keiriMenu(): { key: KeiriGroup; label: string; tabs: KeiriTab[] }[] {
  return GROUP_ORDER.map((key) => ({ key, label: GROUP_LABEL[key], tabs: KEIRI_TABS.filter((t) => t.group === key) }));
}

/** スマホの帯に出すページ名（先頭の絵文字を除く）。経理のページでなければ undefined */
export function keiriPageLabel(path: string): string | undefined {
  return KEIRI_TABS.find((t) => t.href === path)?.label.replace(/^\S+\s/, "");
}
```


- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test 2>&1 | grep -E "^✖|ℹ (pass|fail)"`
Expected: `ℹ fail 0`

Run: `npx tsc --noEmit -p . 2>&1 | head -20`
Expected: 何も出ない（`components/KeiriNav.tsx` は `KEIRI_TABS` の `href`・`label` だけ使うので壊れない）

- [ ] **Step 5: Commit**

```bash
git add lib/keiri/nav.ts lib/keiri/nav.test.ts
git commit -m "経理: サイドバーの分野と並び。保存済み領収書もタブに入れる"
```

---

### Task 4: 行の色とメモ・経理メモの決まり、保存、API

**Files:**
- Create: `lib/keiri/notes.ts`
- Test: `lib/keiri/notes.test.ts`
- Create: `lib/keiri/store.ts`
- Create: `app/api/keiri/marks/route.ts`
- Create: `app/api/keiri/memos/route.ts`

**Interfaces:**
- Consumes: `isMonth(s: string): boolean`（`lib/keiri/period.ts`、既存）
- Produces:
  - `MARK_COLORS`（`{ key, label, bg }` の6色のうち「なし」を除く5つ）、`type MarkColor`、`type RowMark = { color?: MarkColor; note?: string; updatedAt: string }`、`type RowMarks = Record<string, RowMark>`、`NOTE_MAX = 500`、`MEMO_MAX = 1000`
  - `putMark(marks: RowMarks, key: string, input: { color?: string; note?: string }, now: string): RowMarks`
  - `type KeiriMemo = { id: string; month: string; text: string; done: boolean; createdAt: string; doneAt?: string }`
  - `memosForMonth(memos: KeiriMemo[], month: string): KeiriMemo[]`、`addMemo(memos, { month, text }, id, now)`、`setMemoDone(memos, id, done, now)`、`removeMemo(memos, id)`
  - API: `GET /api/keiri/marks?month=` → `{ marks: RowMarks }`、`PUT /api/keiri/marks` `{ month, key, color?, note? }` → `{ marks }`、`GET /api/keiri/memos?month=` → `{ memos: KeiriMemo[] }`、`POST` `{ month, text }`・`PATCH` `{ month, id, done }`・`DELETE ?month=&id=` → `{ memos }`（その月に出すメモ）。エラーは `{ error: string }`（入力の誤り 400、保存の失敗 500）

- [ ] **Step 1: 失敗するテストを書く**

`lib/keiri/notes.test.ts`:

```ts
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
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npm test 2>&1 | grep -E "^✖|ℹ (pass|fail)|notes"`
Expected: FAIL。「Cannot find module './notes.ts'」

- [ ] **Step 3: `lib/keiri/notes.ts` を書く**

```ts
// 月次の表の「行の色とメモ」と「経理メモ（申し送り）」の決まり。KVへの保存は store.ts、ここは純粋な関数だけ。
// 実行時に他のファイルを import しない（テストから .ts 付きで読むため）。

export const MARK_COLORS = [
  { key: "yellow", label: "黄", bg: "#fff3b0" },
  { key: "pink", label: "桃", bg: "#fbd3e0" },
  { key: "cyan", label: "水", bg: "#cdeefa" },
  { key: "green", label: "緑", bg: "#d4f0d0" },
  { key: "orange", label: "橙", bg: "#ffdcb8" },
] as const;
export type MarkColor = (typeof MARK_COLORS)[number]["key"];
export type RowMark = { color?: MarkColor; note?: string; updatedAt: string };
export type RowMarks = Record<string, RowMark>;

export const NOTE_MAX = 500;
export const MEMO_MAX = 1000;

export function isMarkColor(x: unknown): x is MarkColor {
  return MARK_COLORS.some((c) => c.key === x);
}

/** 行の印を付ける・消す。知らない色や空の色は「色なし」、空白だけのメモは「メモなし」。両方なしなら、その行の印を消す */
export function putMark(marks: RowMarks, key: string, input: { color?: string; note?: string }, now: string): RowMarks {
  const next = { ...marks };
  const color = isMarkColor(input.color) ? input.color : undefined;
  const note = (input.note ?? "").trim().slice(0, NOTE_MAX) || undefined;
  if (!color && !note) {
    delete next[key];
    return next;
  }
  next[key] = { ...(color ? { color } : {}), ...(note ? { note } : {}), updatedAt: now };
  return next;
}

export type KeiriMemo = { id: string; month: string; text: string; done: boolean; createdAt: string; doneAt?: string };

/** その月に出す経理メモ。書いた月には必ず出す。前の月に書いて済みにしていないものも出す。済みでないものが先、その中は書いた順 */
export function memosForMonth(memos: KeiriMemo[], month: string): KeiriMemo[] {
  return memos
    .filter((m) => m.month === month || (m.month < month && !m.done))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt.localeCompare(b.createdAt));
}

export function addMemo(memos: KeiriMemo[], input: { month: string; text: string }, id: string, now: string): KeiriMemo[] {
  const text = input.text.trim().slice(0, MEMO_MAX);
  if (!text) throw new Error("メモが空です");
  return [...memos, { id, month: input.month, text, done: false, createdAt: now }];
}

export function setMemoDone(memos: KeiriMemo[], id: string, done: boolean, now: string): KeiriMemo[] {
  if (!memos.some((m) => m.id === id)) throw new Error("メモが見つかりません");
  return memos.map((m) => {
    if (m.id !== id) return m;
    if (done) return { ...m, done: true, doneAt: now };
    return { id: m.id, month: m.month, text: m.text, done: false, createdAt: m.createdAt };
  });
}

export function removeMemo(memos: KeiriMemo[], id: string): KeiriMemo[] {
  return memos.filter((m) => m.id !== id);
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test 2>&1 | grep -E "^✖|ℹ (pass|fail)"`
Expected: `ℹ fail 0`

- [ ] **Step 5: `lib/keiri/store.ts` を書く（KV。テストしない）**

```ts
// 月次の表の「行の色とメモ」「経理メモ」を KV に保存する。決まりは notes.ts。
// KV が無い環境では、読むと空、書くとエラー（lib/pending-expenses.ts と同じ作り）。
import type { KeiriMemo, RowMarks } from "./notes";

const MARKS = (month: string) => `keiri:marks:${month}`;
const MEMOS = "keiri:memos";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

async function mustKv() {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  return store;
}

export async function getMarks(month: string): Promise<RowMarks> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<RowMarks>(MARKS(month))) ?? {};
}

/** 印が1つも無くなった月はキーごと消す */
export async function saveMarks(month: string, marks: RowMarks): Promise<void> {
  const store = await mustKv();
  if (Object.keys(marks).length === 0) await store.del(MARKS(month));
  else await store.set(MARKS(month), marks);
}

export async function getMemos(): Promise<KeiriMemo[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<KeiriMemo[]>(MEMOS)) ?? [];
}

export async function saveMemos(memos: KeiriMemo[]): Promise<void> {
  const store = await mustKv();
  await store.set(MEMOS, memos);
}
```

- [ ] **Step 6: `app/api/keiri/marks/route.ts` を書く**

```ts
import { NextRequest, NextResponse } from "next/server";
import { isMonth } from "@/lib/keiri/period";
import { putMark } from "@/lib/keiri/notes";
import { getMarks, saveMarks } from "@/lib/keiri/store";

export const runtime = "nodejs";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// GET /api/keiri/marks?month=2026-10 → { marks }（行の key → 色とメモ）
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!isMonth(month)) return fail("月の指定が正しくありません", 400);
  try {
    return NextResponse.json({ marks: await getMarks(month) });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "読み込みに失敗しました", 500);
  }
}

// PUT /api/keiri/marks { month, key, color?, note? } → { marks }。色もメモも空なら、その行の印を消す
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const month = typeof body?.month === "string" ? body.month : "";
  const key = typeof body?.key === "string" ? body.key : "";
  if (!isMonth(month)) return fail("月の指定が正しくありません", 400);
  if (!key || key.length > 100) return fail("行の指定が正しくありません", 400);
  try {
    const marks = putMark(
      await getMarks(month),
      key,
      {
        color: typeof body?.color === "string" ? body.color : undefined,
        note: typeof body?.note === "string" ? body.note : undefined,
      },
      new Date().toISOString(),
    );
    await saveMarks(month, marks);
    return NextResponse.json({ marks });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "保存に失敗しました", 500);
  }
}
```

- [ ] **Step 7: `app/api/keiri/memos/route.ts` を書く**

```ts
import { NextRequest, NextResponse } from "next/server";
import { isMonth } from "@/lib/keiri/period";
import { addMemo, memosForMonth, removeMemo, setMemoDone, type KeiriMemo } from "@/lib/keiri/notes";
import { getMemos, saveMemos } from "@/lib/keiri/store";

export const runtime = "nodejs";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** 一覧を変えて保存し、その月に出すメモを返す。変え方の誤り（空のメモなど）は 400、保存の失敗は 500 */
async function update(month: string, change: (memos: KeiriMemo[]) => KeiriMemo[]) {
  let next: KeiriMemo[];
  try {
    next = change(await getMemos());
  } catch (e) {
    return fail(message(e, "変更できませんでした"), 400);
  }
  try {
    await saveMemos(next);
  } catch (e) {
    return fail(message(e, "保存に失敗しました"), 500);
  }
  return NextResponse.json({ memos: memosForMonth(next, month) });
}

// GET /api/keiri/memos?month=2026-10 → { memos }（その月に出す経理メモ）
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!isMonth(month)) return fail("月の指定が正しくありません", 400);
  try {
    return NextResponse.json({ memos: memosForMonth(await getMemos(), month) });
  } catch (e) {
    return fail(message(e, "読み込みに失敗しました"), 500);
  }
}

// POST /api/keiri/memos { month, text }
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const month = typeof body?.month === "string" ? body.month : "";
  const text = typeof body?.text === "string" ? body.text : "";
  if (!isMonth(month)) return fail("月の指定が正しくありません", 400);
  const id = `km_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return update(month, (memos) => addMemo(memos, { month, text }, id, new Date().toISOString()));
}

// PATCH /api/keiri/memos { month, id, done } → 済みにする／戻す
export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const month = typeof body?.month === "string" ? body.month : "";
  const id = typeof body?.id === "string" ? body.id : "";
  if (!isMonth(month)) return fail("月の指定が正しくありません", 400);
  if (typeof body?.done !== "boolean") return fail("済みかどうかの指定が正しくありません", 400);
  const done = body.done;
  return update(month, (memos) => setMemoDone(memos, id, done, new Date().toISOString()));
}

// DELETE /api/keiri/memos?month=2026-10&id=km_...
export async function DELETE(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? "";
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!isMonth(month)) return fail("月の指定が正しくありません", 400);
  return update(month, (memos) => removeMemo(memos, id));
}
```

- [ ] **Step 8: 型チェックとテスト**

Run: `npx tsc --noEmit -p . 2>&1 | head -20`
Expected: 何も出ない

Run: `npm test 2>&1 | grep -E "^✖|ℹ (pass|fail)"`
Expected: `ℹ fail 0`

- [ ] **Step 9: Commit**

```bash
git add lib/keiri/notes.ts lib/keiri/notes.test.ts lib/keiri/store.ts app/api/keiri/marks/route.ts app/api/keiri/memos/route.ts
git commit -m "経理の月次: 行の色とメモ・経理メモの決まりと保存のAPI"
```

---

### Task 5: 経理のページをサイドバーのレイアウトに移す

**Files:**
- Move: `app/{keiri,ryoshusho,receipts,meisai,pending,kariire,payables,bills,loans,items,report,shorui,contracts,company,zeirishi}` → `app/(keiri)/…`
- Modify: 移した14ページの `page.tsx`（`import Nav` と `<Nav />` を消す）、`components/keiri/KeiriMonthly.tsx`（同じ）
- Create: `app/(keiri)/layout.tsx`
- Create: `components/keiri/KeiriShell.tsx`
- Modify: `components/Nav.tsx`
- Delete: `components/KeiriNav.tsx`
- Modify: `components/HelpWidget.tsx`

**Interfaces:**
- Consumes: `keiriMenu()`・`keiriPageLabel(path)`・`isKeiriPath(path)`（Task 3）
- Produces: `KeiriShell({ children })`（経理のページを包む外枠）。ページの中身の幅は各ページのまま

- [ ] **Step 1: ページを移す**

```bash
cd /Users/sakamototatsurou/system
mkdir -p "app/(keiri)"
for d in keiri ryoshusho receipts meisai pending kariire payables bills loans items report shorui contracts company zeirishi; do
  git mv "app/$d" "app/(keiri)/$d"
done
ls "app/(keiri)"
```
Expected: 15個のフォルダが並ぶ

- [ ] **Step 2: 各ページから店舗側のナビを外す**

```bash
for f in "app/(keiri)"/*/page.tsx components/keiri/KeiriMonthly.tsx; do
  sed -i '' -e '/^import Nav from "@\/components\/Nav";$/d' -e '/^[[:space:]]*<Nav \/>[[:space:]]*$/d' "$f"
done
grep -rn "components/Nav\|<Nav" "app/(keiri)" components/keiri
```
Expected: 何も出ない

- [ ] **Step 3: `components/keiri/KeiriShell.tsx` を書く**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { keiriMenu, keiriPageLabel } from "@/lib/keiri/nav";

// 経理のページの外枠。PC は左にサイドバーを固定、スマホは上の帯の ☰ でメニューを開く。
// 店舗側のナビ（components/Nav.tsx）とは別物。app/(keiri)/layout.tsx が使う。
export default function KeiriShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  // ページを移ったらスマホのメニューを閉じる
  useEffect(() => setOpen(false), [path]);

  const menu = (
    <nav className="menu" aria-label="経理のメニュー">
      {keiriMenu().map((g) => (
        <div key={g.key} className="grp">
          {g.label && <div className="glabel">{g.label}</div>}
          {g.tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`item ${path === t.href ? "on" : ""}`}
              aria-current={path === t.href ? "page" : undefined}
            >
              {t.label}
            </Link>
          ))}
        </div>
      ))}
      <Link href="/table" className="item back">← 店舗へ</Link>
    </nav>
  );

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">flat. 経理</div>
        {menu}
      </aside>

      <header className="topbar">
        <button
          type="button"
          className="burger"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="keiri-drawer"
          aria-label={open ? "メニューを閉じる" : "メニューを開く"}
        >
          ☰
        </button>
        <span className="brand">経理</span>
        <span className="page">{keiriPageLabel(path) ?? ""}</span>
      </header>
      {open && (
        <>
          <button type="button" className="scrim" aria-label="メニューを閉じる" onClick={() => setOpen(false)} />
          <div className="drawer" id="keiri-drawer">{menu}</div>
        </>
      )}

      <div className="content">{children}</div>

      <style jsx>{`
        .side { display: none; }
        .topbar {
          position: sticky;
          top: 0;
          z-index: 930;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          background: var(--ink);
          color: #fff;
        }
        .burger {
          width: 40px;
          height: 40px;
          border: 0;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
          font-size: 20px;
          cursor: pointer;
        }
        .burger:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        .brand { font-weight: 800; letter-spacing: 0.06em; }
        .page { opacity: 0.8; font-size: 14px; }
        .scrim {
          position: fixed;
          inset: 0;
          z-index: 940;
          border: 0;
          padding: 0;
          background: rgba(0, 0, 0, 0.35);
        }
        .drawer {
          position: fixed;
          top: 56px;
          left: 0;
          right: 0;
          max-height: calc(100vh - 56px);
          overflow-y: auto;
          z-index: 950;
          background: var(--ink);
          padding: 8px 12px 16px;
        }
        .menu { display: flex; flex-direction: column; gap: 14px; }
        .grp { display: flex; flex-direction: column; gap: 2px; }
        .glabel { font-size: 11px; letter-spacing: 0.08em; color: rgba(255, 255, 255, 0.5); padding: 0 10px 2px; }
        .menu :global(.item) {
          display: block;
          padding: 8px 10px;
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.85);
          text-decoration: none;
          font-size: 14px;
        }
        .menu :global(.item:hover) { background: rgba(255, 255, 255, 0.08); color: #fff; }
        .menu :global(.item.on) { background: rgba(255, 255, 255, 0.16); color: #fff; font-weight: 700; }
        .menu :global(.item:focus-visible) { outline: 2px solid #fff; outline-offset: -2px; }
        .menu :global(.item.back) { margin-top: 6px; color: rgba(255, 255, 255, 0.6); }

        @media (min-width: 900px) {
          .side {
            display: block;
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: 220px;
            overflow-y: auto;
            background: var(--ink);
            color: #fff;
            padding: 18px 12px;
            z-index: 930;
          }
          .side .brand { display: block; font-size: 18px; padding: 0 10px 16px; }
          .topbar, .drawer, .scrim { display: none; }
          .content { margin-left: 220px; }
        }

        @media print {
          .side, .topbar, .drawer, .scrim { display: none; }
          .content { margin-left: 0; }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 4: `app/(keiri)/layout.tsx` を書く**

```tsx
import KeiriShell from "@/components/keiri/KeiriShell";

// 経理のページ（app/(keiri)/ の下）だけを包むレイアウト。ルートグループなので URL には出ない
export default function KeiriLayout({ children }: { children: React.ReactNode }) {
  return <KeiriShell>{children}</KeiriShell>;
}
```

- [ ] **Step 5: 店舗側のナビから経理用ナビへの差し替えを消し、`KeiriNav` を消す**

`components/Nav.tsx` から次の4か所を消す（「経理 →」のリンクは残す）:

```tsx
import KeiriNav from "@/components/KeiriNav";
import { isKeiriPath } from "@/lib/keiri/nav";
```
```tsx
  const inKeiri = isKeiriPath(path);
```
```tsx
  if (inKeiri) return <KeiriNav path={path} />;
```

```bash
git rm components/KeiriNav.tsx
grep -rn "KeiriNav" app components lib
```
Expected: 何も出ない

- [ ] **Step 6: 経理のページではヘルプのチャットを出さない**

`components/HelpWidget.tsx` の import に足す:

```tsx
import { isKeiriPath } from "@/lib/keiri/nav";
```

同じファイルの `  if (!open) {` の直前（フックをすべて呼んだ後）に足す:

```tsx
  // 経理の画面は店舗側と分けているので、使い方チャットを出さない
  if (isKeiriPath(path)) return null;

```

- [ ] **Step 7: build で確かめる**

Run: `npm run build > /tmp/keiri-build.log 2>&1; echo EXIT=$?; grep -E "Type error|Failed|error" /tmp/keiri-build.log | grep -v swc | head`
Expected: `EXIT=0`。エラーなし。`grep -E "^├|^└" /tmp/keiri-build.log | grep -E "/keiri|/ryoshusho|/receipts"` で3ページが今と同じ URL で並ぶ

Run: `npm test 2>&1 | grep -E "^✖|ℹ (pass|fail)"`
Expected: `ℹ fail 0`

- [ ] **Step 8: Commit**

```bash
git add -A "app/(keiri)" app components/keiri/KeiriShell.tsx components/keiri/KeiriMonthly.tsx components/Nav.tsx components/HelpWidget.tsx
git commit -m "経理のページを左のサイドバーの専用レイアウトに移す（URLはそのまま）"
```

---

### Task 6: 月次の表（区切り・小計・合計・行を開く・絞り込み・印刷）

**Files:**
- Create: `components/keiri/KeiriSheet.tsx`
- Modify: `components/keiri/KeiriMonthly.tsx`（全体を置き換え）
- Delete: `components/keiri/CashTable.tsx`
- Modify: `lib/keiri/nav.ts`（`inflowLabel` を消す）、`lib/keiri/nav.test.ts`（`inflowLabel` のテストと import を消す）

**Interfaces:**
- Consumes: `buildSheet`・`monthTabs`・`NO_FILTER`・`type Sheet`・`type SheetRow`・`type SheetFilter`（Task 2）、`freeeLinks`（Task 3 の nav.ts、既存）、`KeiriMonthlyResponse`（`app/api/keiri/monthly/route.ts`、既存）
- Produces: `KeiriSheet({ sheet }: { sheet: Sheet })`（Task 7 で `marks`・`onOpenMark` を足す）

- [ ] **Step 1: `components/keiri/KeiriSheet.tsx` を書く**

```tsx
"use client";

import { Fragment, useState } from "react";
import type { Sheet, SheetRow } from "@/lib/keiri/sheet";
import { freeeLinks } from "@/lib/keiri/nav";
import ReceiptPreview from "./ReceiptPreview";
import { md, yen } from "./format";

const STATUS_LABEL = { done: "✓", todo: "未処理", waiting: "消込待ち" } as const;

function ReceiptCell({ row, onOpen }: { row: SheetRow; onOpen: () => void }) {
  switch (row.receiptStatus) {
    case "attached":
      return (
        <button type="button" className="rc ok" onClick={(e) => { e.stopPropagation(); onOpen(); }} aria-label="領収書を開く">
          🧾
        </button>
      );
    case "amazon":
      return (
        <a
          className="rc ok"
          target="_blank"
          rel="noreferrer"
          href={`https://www.amazon.co.jp/gp/your-account/order-details?orderID=${row.amazonOrderId}`}
          onClick={(e) => e.stopPropagation()}
        >
          📦 注文
        </a>
      );
    case "missing-recorded":
      return <span className="rc warn">⚠ なし（記録済み）</span>;
    case "missing":
      return <span className="rc bad">⚠ なし</span>;
    default:
      return null;
  }
}

// 月次の「経理で見る」の表。1行＝1件の入出金。区切りごとに小計、最後に合計（移動は除く）。
// 行を押すと、すぐ下に明細の原文・freeeのリンク・領収書の画像を開く。
export default function KeiriSheet({ sheet }: { sheet: Sheet }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = (key: string) => setOpenKey(openKey === key ? null : key);

  if (sheet.sections.length === 0) return <p className="hint">条件に合う行はありません。</p>;

  return (
    <div className="sheet-wrap">
      <table className="sheet">
        <thead>
          <tr>
            <th className="c-date">日付</th>
            <th className="c-who">相手</th>
            <th className="c-acct">科目</th>
            <th className="c-desc">摘要</th>
            <th className="c-amt">入金</th>
            <th className="c-amt">出金</th>
            <th className="c-rc">領収書</th>
            <th className="c-st">freee</th>
          </tr>
        </thead>
        <tbody>
          {sheet.sections.map((sec) => (
            <Fragment key={sec.key}>
              <tr className={`sec sec-${sec.key}`}>
                <th colSpan={4} scope="rowgroup">
                  <span className="bar" aria-hidden="true" />
                  {sec.label}
                  <span className="count">{sec.rows.length}件</span>
                  {sec.key === "move" && <span className="note">口座⇄現金の移動。合計に入れない</span>}
                </th>
                <td className="c-amt">{sec.inSum ? yen(sec.inSum) : ""}</td>
                <td className="c-amt">{sec.outSum ? yen(sec.outSum) : ""}</td>
                <td colSpan={2} />
              </tr>
              {sec.rows.map((r) => (
                <Fragment key={r.key}>
                  <tr
                    className={`row ${r.kind === "move" ? "move" : ""} ${r.status !== "done" ? "todo" : ""}`}
                    onClick={() => toggle(r.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(r.key);
                      }
                    }}
                    tabIndex={0}
                    aria-expanded={openKey === r.key}
                  >
                    <td className="c-date">{md(r.date)}</td>
                    <td className="c-who" title={r.partner ?? r.title}>{r.partner ?? r.title}</td>
                    <td className="c-acct">{r.account}</td>
                    <td className="c-desc">{r.description}</td>
                    <td className="c-amt">{r.side === "in" ? yen(r.amount) : ""}</td>
                    <td className="c-amt">{r.side === "out" ? yen(r.amount) : ""}</td>
                    <td className="c-rc"><ReceiptCell row={r} onOpen={() => setOpenKey(r.key)} /></td>
                    <td className={`c-st st-${r.status}`}>{STATUS_LABEL[r.status]}</td>
                  </tr>
                  {openKey === r.key && (
                    <tr className="detail">
                      <td colSpan={8}>
                        <div>元の文字: {r.title}</div>
                        <div className="links">
                          {freeeLinks(r).map((l) => (
                            <a key={l.href} href={l.href} target="_blank" rel="noreferrer">{l.label}</a>
                          ))}
                        </div>
                        {r.receipt && <ReceiptPreview id={r.receipt.id} title={r.receipt.vendor} />}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="total">
            <th colSpan={4} scope="row">
              合計（移動を除く）<span className="net">差引 {yen(sheet.totals.net)}</span>
            </th>
            <td className="c-amt">{yen(sheet.totals.in)}</td>
            <td className="c-amt">{yen(sheet.totals.out)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>

      <style jsx>{`
        .sheet-wrap { background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
        .sheet { width: 100%; min-width: 880px; border-collapse: separate; border-spacing: 0; font-size: 13px; }
        th, td { padding: 6px 10px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; vertical-align: top; }
        thead th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: #f1efea;
          color: var(--muted);
          font-size: 12px;
          font-weight: 700;
        }
        thead th:first-child { border-top-left-radius: 12px; }
        thead th:last-child { border-top-right-radius: 12px; }
        .c-amt { text-align: right; font-variant-numeric: tabular-nums; }
        .c-date { width: 52px; color: var(--muted); font-variant-numeric: tabular-nums; }
        .c-who { max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
        .c-desc { white-space: normal; min-width: 200px; }
        .c-st { width: 64px; }

        .sec th, .sec td { font-weight: 700; border-bottom-color: transparent; }
        .sec .bar { display: inline-block; width: 4px; height: 14px; border-radius: 2px; margin-right: 8px; vertical-align: -2px; }
        .sec .count { margin-left: 8px; font-weight: 400; font-size: 12px; color: var(--muted); }
        .sec .note { margin-left: 8px; font-weight: 400; font-size: 11px; color: var(--muted); }
        .sec-in th, .sec-in td { background: #eaf4ea; } .sec-in .bar { background: #2e7d32; }
        .sec-card th, .sec-card td { background: var(--accent-weak); } .sec-card .bar { background: var(--accent); }
        .sec-bank th, .sec-bank td { background: #e8eef7; } .sec-bank .bar { background: #2f5d9b; }
        .sec-cash th, .sec-cash td { background: #e3f2ef; } .sec-cash .bar { background: #00796b; }
        .sec-tatekae th, .sec-tatekae td { background: #f6e8f3; } .sec-tatekae .bar { background: #8e3a7d; }
        .sec-move th, .sec-move td { background: #efede8; } .sec-move .bar { background: #7a756c; }

        .row { cursor: pointer; }
        .row:hover td { background: #faf8f4; }
        .row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
        .row.move td { color: var(--muted); }
        .row.todo .c-who { color: #c62828; }
        .st-done { color: var(--ok, #2e7d32); }
        .st-todo { color: #c62828; font-weight: 700; }
        .st-waiting { color: #8a5300; font-weight: 700; }

        .rc { border: 0; background: none; padding: 0; font: inherit; cursor: pointer; text-decoration: none; }
        .rc.ok { color: var(--accent); }
        .rc.warn { color: #8a5300; cursor: default; }
        .rc.bad { color: #c62828; cursor: default; }
        .rc:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

        .detail td { background: #fbfaf7; white-space: normal; font-size: 12px; color: var(--muted); }
        .links { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 4px; }
        .links a { color: var(--accent); }

        .total th, .total td { font-weight: 800; border-top: 2px solid var(--ink); border-bottom: 0; }
        .net { margin-left: 16px; font-variant-numeric: tabular-nums; }

        @media (max-width: 899px) {
          .sheet-wrap { overflow-x: auto; }
        }
        @media print {
          .sheet-wrap { border: 0; }
          .sheet { min-width: 0; font-size: 10px; }
          thead th { position: static; }
          .detail { display: none; }
          .row:hover td { background: none; }
          tr { break-inside: avoid; }
          .sec th, .sec td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: `components/keiri/KeiriMonthly.tsx` を置き換える**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { KeiriMonthlyResponse } from "@/app/api/keiri/monthly/route";
import KeiriSheet from "./KeiriSheet";
import PlTable from "./PlTable";
import { monthLabel, yen } from "./format";
import { isMonth, jstMonth } from "@/lib/keiri/period";
import { buildSheet, monthTabs, NO_FILTER, type SheetFilter } from "@/lib/keiri/sheet";

// 月次ページ。上から 月のタブ → 数字のカード → 道具の帯 → 表（経理で見る）または損益計算書（会計で見る）。
export default function KeiriMonthly() {
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("month") ?? "";
  const thisMonth = jstMonth();
  const month = isMonth(raw) ? raw : thisMonth;
  const view = sp.get("view") === "pl" ? "pl" : "cash";
  const [data, setData] = useState<KeiriMonthlyResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SheetFilter>(NO_FILTER);

  const go = useCallback(
    (m: string, v: string) => router.push(`/keiri?month=${m}&view=${v}`),
    [router],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setData(null); // 前の月の数字が残らないように
    fetch(`/api/keiri/monthly?month=${encodeURIComponent(month)}&view=${view}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) setError(j.error || "読み込みに失敗しました");
        else setData(j as KeiriMonthlyResponse);
      })
      .catch(() => alive && setError("読み込みに失敗しました"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [month, view]);

  const sheet = useMemo(() => (data?.cash ? buildSheet(data.cash, filter) : null), [data, filter]);
  const t = data?.cash?.totals;

  return (
    <main className="wide">
      <h1>{monthLabel(month)}の月次</h1>

      <div className="months" role="tablist" aria-label="月">
        {monthTabs(thisMonth).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={m === month}
            className={m === month ? "on" : ""}
            onClick={() => go(m, view)}
          >
            {Number(m.slice(5, 7))}月{m === thisMonth ? " *" : ""}
          </button>
        ))}
      </div>

      {error && (
        <section className="card">
          <p>{error}</p>
          {error.includes("未接続") && <a href="/api/freee/authorize">freeeに接続する</a>}
        </section>
      )}
      {loading && !error && <p className="hint">freeeから読み込んでいます…</p>}
      {!loading && data?.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
      {!loading && (data?.future || data?.noData) && <section className="card"><p>まだデータがありません。</p></section>}

      {t && (
        <section className="kpis" aria-label="この月の数字">
          <div><span className="cap">入金</span><b>{yen(t.in)}</b></div>
          <div><span className="cap">出金</span><b>{yen(t.out)}</b></div>
          <div><span className="cap">差引</span><b className={t.net >= 0 ? "g" : "r"}>{yen(t.net)}</b></div>
          <div><span className="cap">領収書なし</span><b className={t.missingReceipts ? "r" : ""}>{t.missingReceipts}件</b></div>
          <div><span className="cap">未処理</span><b className={t.unprocessed ? "r" : ""}>{t.unprocessed}件</b></div>
        </section>
      )}

      <div className="tools">
        {view === "cash" && (
          <>
            <input
              type="search"
              className="q"
              placeholder="相手・科目・摘要・メモで絞り込み"
              aria-label="絞り込み"
              value={filter.query}
              onChange={(e) => setFilter({ ...filter, query: e.target.value })}
            />
            <label>
              <input type="checkbox" checked={filter.missingOnly} onChange={(e) => setFilter({ ...filter, missingOnly: e.target.checked })} />
              領収書なしだけ
            </label>
            <label>
              <input type="checkbox" checked={filter.todoOnly} onChange={(e) => setFilter({ ...filter, todoOnly: e.target.checked })} />
              未処理だけ
            </label>
            <button type="button" className="print" onClick={() => window.print()}>🖨 印刷（A4横）</button>
          </>
        )}
        <div className="views" role="tablist" aria-label="見方">
          <button type="button" role="tab" aria-selected={view === "cash"} className={view === "cash" ? "on" : ""} onClick={() => go(month, "cash")}>経理で見る</button>
          <button type="button" role="tab" aria-selected={view === "pl"} className={view === "pl" ? "on" : ""} onClick={() => go(month, "pl")}>会計で見る</button>
        </div>
      </div>

      {!loading && view === "cash" && sheet && <KeiriSheet sheet={sheet} />}
      {!loading && view === "pl" && data?.pl && <PlTable data={data.pl} />}

      <style jsx>{`
        main.wide { max-width: none; padding: 20px 24px 64px; }
        h1 { font-size: 22px; margin: 0 0 12px; }
        .months { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
        .months button {
          border: 1px solid var(--line);
          background: var(--card);
          color: var(--ink);
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 14px;
          cursor: pointer;
          font-variant-numeric: tabular-nums;
        }
        .months button.on { background: var(--ink); border-color: var(--ink); color: #fff; font-weight: 700; }
        .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 14px; }
        .kpis div { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
        .cap { font-size: 12px; color: var(--muted); }
        .kpis b { font-size: 20px; font-variant-numeric: tabular-nums; }
        .g { color: var(--ok, #2e7d32); }
        .r { color: #c62828; }
        .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-bottom: 10px; }
        .q { flex: 1 1 220px; max-width: 320px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); font: inherit; font-size: 14px; }
        .tools label { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; cursor: pointer; }
        .print { border: 1px solid var(--line); background: var(--card); border-radius: 8px; padding: 7px 12px; cursor: pointer; font: inherit; font-size: 13px; }
        .views { margin-left: auto; display: inline-flex; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
        .views button { border: 0; background: var(--card); padding: 8px 14px; font-weight: 700; color: var(--muted); cursor: pointer; }
        .views button.on { background: var(--ink); color: #fff; }
        .months button:focus-visible, .views button:focus-visible, .print:focus-visible, .q:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .warn { background: #fff4e5; color: #8a5300; border-radius: 10px; padding: 8px 12px; font-size: 13px; }
        @media (max-width: 899px) {
          main.wide { padding: 14px 12px 64px; }
          .views { margin-left: 0; }
        }
        @media print {
          main.wide { padding: 0; }
          .months, .tools, .warn { display: none; }
          .kpis div { border-color: #999; }
        }
      `}</style>
      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
    </main>
  );
}
```

- [ ] **Step 3: カード型の一覧と、使わなくなった `inflowLabel` を消す**

```bash
git rm components/keiri/CashTable.tsx
```

`lib/keiri/nav.ts` から `inflowLabel` 関数（`export function inflowLabel(...) { ... }` の3行）を消す。

`lib/keiri/nav.test.ts` の import から `inflowLabel, ` を消し、テスト「入金の区分の表示名」を丸ごと消す。

```bash
grep -rn "CashTable\|inflowLabel" app components lib
```
Expected: 何も出ない

- [ ] **Step 4: テストと build**

Run: `npm test 2>&1 | grep -E "^✖|ℹ (pass|fail)"`
Expected: `ℹ fail 0`

Run: `npm run build > /tmp/keiri-build.log 2>&1; echo EXIT=$?; grep -E "Type error|Failed" /tmp/keiri-build.log | head`
Expected: `EXIT=0`。エラーなし

- [ ] **Step 5: Commit**

```bash
git add components/keiri/KeiriSheet.tsx components/keiri/KeiriMonthly.tsx lib/keiri/nav.ts lib/keiri/nav.test.ts
git commit -m "経理の月次: 経理で見るを区切りと小計のあるエクセル風の表にする。絞り込みと印刷"
```

---

### Task 7: 行の色とメモ

**Files:**
- Create: `components/keiri/RowMarkMenu.tsx`
- Modify: `components/keiri/KeiriSheet.tsx`
- Modify: `components/keiri/KeiriMonthly.tsx`

**Interfaces:**
- Consumes: `MARK_COLORS`・`NOTE_MAX`・`type RowMark`・`type RowMarks`（Task 4）、`GET/PUT /api/keiri/marks`（Task 4）、`buildSheet(view, filter, notes)`（Task 2）
- Produces: `RowMarkMenu({ title, mark, at, onSave, onClose })`、`KeiriSheet({ sheet, marks, onOpenMark })`

- [ ] **Step 1: `components/keiri/RowMarkMenu.tsx` を書く**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { MARK_COLORS, NOTE_MAX, type RowMark } from "@/lib/keiri/notes";

type Props = {
  title: string; // どの行か（相手と金額）
  mark?: RowMark;
  at: { x: number; y: number }; // 画面上の位置（右クリックした場所、またはメモのセルの下）
  onSave: (input: { color: string; note: string }) => Promise<void>; // 失敗したら throw する
  onClose: () => void;
};

const WIDTH = 280;
const HEIGHT = 270;

// 行の色とメモを付ける小さなメニュー。保存に失敗したら開いたまま「保存できませんでした」と出す。
export default function RowMarkMenu({ title, mark, at, onSave, onClose }: Props) {
  const [color, setColor] = useState<string>(mark?.color ?? "");
  const [note, setNote] = useState(mark?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    noteRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  // 画面の外にはみ出さないようにずらす
  const left = Math.max(8, Math.min(at.x, window.innerWidth - WIDTH - 8));
  const top = Math.max(8, Math.min(at.y, window.innerHeight - HEIGHT - 8));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave({ color, note });
    } catch {
      setError("保存できませんでした");
      setSaving(false);
    }
  };

  return (
    <div ref={box} className="menu" role="dialog" aria-label={`${title} の色とメモ`} style={{ left, top }}>
      <div className="ttl">{title}</div>
      <div className="colors" role="radiogroup" aria-label="色">
        <button type="button" role="radio" aria-checked={color === ""} className={`sw none ${color === "" ? "on" : ""}`} onClick={() => setColor("")}>
          なし
        </button>
        {MARK_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={color === c.key}
            className={`sw ${color === c.key ? "on" : ""}`}
            style={{ background: c.bg }}
            onClick={() => setColor(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <textarea
        ref={noteRef}
        value={note}
        maxLength={NOTE_MAX}
        rows={3}
        aria-label="メモ"
        placeholder="メモ（例: 返品予定。10月に返金）"
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <p className="err" role="alert">{error}</p>}
      <div className="btns">
        <button type="button" onClick={onClose}>閉じる</button>
        <button type="button" className="ok" onClick={save} disabled={saving}>{saving ? "保存中…" : "保存"}</button>
      </div>

      <style jsx>{`
        .menu {
          position: fixed;
          z-index: 960;
          width: ${WIDTH}px;
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ttl { font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .colors { display: flex; flex-wrap: wrap; gap: 6px; }
        .sw { min-width: 36px; height: 30px; border: 1px solid var(--line); border-radius: 8px; font-size: 12px; cursor: pointer; color: var(--ink); background: var(--card); }
        .sw.on { outline: 2px solid var(--ink); outline-offset: 1px; font-weight: 700; }
        .sw:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
        textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--line); border-radius: 8px; padding: 8px; font: inherit; font-size: 13px; resize: vertical; }
        textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
        .err { margin: 0; color: #c62828; font-size: 12px; }
        .btns { display: flex; justify-content: flex-end; gap: 8px; }
        .btns button { border: 1px solid var(--line); background: var(--card); border-radius: 8px; padding: 6px 12px; cursor: pointer; font: inherit; font-size: 13px; }
        .btns .ok { background: var(--ink); border-color: var(--ink); color: #fff; font-weight: 700; }
        .btns .ok:disabled { opacity: 0.6; cursor: default; }
        .btns button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: 表にメモの列と色を足す（`components/keiri/KeiriSheet.tsx`）**

import を次に置き換える:

```tsx
import { Fragment, useState } from "react";
import type { Sheet, SheetRow } from "@/lib/keiri/sheet";
import { MARK_COLORS, type RowMarks } from "@/lib/keiri/notes";
import { freeeLinks } from "@/lib/keiri/nav";
import ReceiptPreview from "./ReceiptPreview";
import { md, yen } from "./format";

const STATUS_LABEL = { done: "✓", todo: "未処理", waiting: "消込待ち" } as const;
const MARK_BG: Record<string, string> = Object.fromEntries(MARK_COLORS.map((c) => [c.key, c.bg]));
```

（元の `const STATUS_LABEL = ...` の行は、上に含めたので消す）

コンポーネントの宣言を次に置き換える:

```tsx
type Props = {
  sheet: Sheet;
  marks: RowMarks;
  onOpenMark: (row: SheetRow, at: { x: number; y: number }) => void;
};

// 月次の「経理で見る」の表。1行＝1件の入出金。区切りごとに小計、最後に合計（移動は除く）。
// 行を押すと、すぐ下に明細の原文・freeeのリンク・領収書の画像を開く。右クリックかメモのセルで、色とメモを付ける。
export default function KeiriSheet({ sheet, marks, onOpenMark }: Props) {
```

見出しの行の `<th className="c-st">freee</th>` の後ろに足す:

```tsx
            <th className="c-memo">メモ</th>
```

区切りの行と合計の行の `<td colSpan={2} />` を、どちらも `<td colSpan={3} />` にする（2か所）。

行の `<tr` を次に置き換える（`onContextMenu` と `style` を足す）:

```tsx
                  <tr
                    className={`row ${r.kind === "move" ? "move" : ""} ${r.status !== "done" ? "todo" : ""}`}
                    style={marks[r.key]?.color ? { background: MARK_BG[marks[r.key].color ?? ""] } : undefined}
                    onClick={() => toggle(r.key)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onOpenMark(r, { x: e.clientX, y: e.clientY });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(r.key);
                      }
                    }}
                    tabIndex={0}
                    aria-expanded={openKey === r.key}
                  >
```

行の `<td className={`c-st st-${r.status}`}>…</td>` の後ろに足す:

```tsx
                    <td className="c-memo">
                      <button
                        type="button"
                        className={`memo-btn ${marks[r.key]?.note ? "has" : ""}`}
                        aria-label={`${r.partner ?? r.title} の色とメモ`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          onOpenMark(r, { x: rect.left, y: rect.bottom + 4 });
                        }}
                      >
                        {marks[r.key]?.note || "＋"}
                      </button>
                    </td>
```

詳細の行の `<td colSpan={8}>` を `<td colSpan={9}>` にする。

`<style jsx>` の `.c-st { width: 64px; }` の後ろに足す:

```css
        .c-memo { min-width: 120px; max-width: 260px; white-space: normal; }
        .memo-btn { border: 0; background: none; padding: 0; font: inherit; font-size: 12px; text-align: left; cursor: pointer; color: var(--muted); }
        .memo-btn.has { color: var(--ink); }
        .memo-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

`@media print { ... }` の中の最後に足す:

```css
          .row { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .memo-btn:not(.has) { visibility: hidden; }
```

- [ ] **Step 3: 月次ページで色とメモを読み書きする（`components/keiri/KeiriMonthly.tsx`）**

import に足す:

```tsx
import RowMarkMenu from "./RowMarkMenu";
import type { RowMarks } from "@/lib/keiri/notes";
```

同じファイルの `@/lib/keiri/sheet` の import を次に置き換える（`SheetRow` の型を足す）:

```tsx
import { buildSheet, monthTabs, NO_FILTER, type SheetFilter, type SheetRow } from "@/lib/keiri/sheet";
```

`const [filter, setFilter] = ...` の後ろに足す:

```tsx
  const [marks, setMarks] = useState<RowMarks>({});
  const [marksError, setMarksError] = useState("");
  const [menu, setMenu] = useState<{ row: SheetRow; at: { x: number; y: number } } | null>(null);
```

月次のデータを読む `useEffect` の後ろに足す:

```tsx
  // 行の色とメモは freee の読み込みを待たずに取る
  useEffect(() => {
    let alive = true;
    setMarks({});
    setMarksError("");
    setMenu(null);
    fetch(`/api/keiri/marks?month=${encodeURIComponent(month)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) setMarksError("メモと色を読み込めませんでした");
        else setMarks(j.marks as RowMarks);
      })
      .catch(() => alive && setMarksError("メモと色を読み込めませんでした"));
    return () => { alive = false; };
  }, [month]);

  const closeMenu = useCallback(() => setMenu(null), []);

  // 保存できたら画面の色とメモを保存後のものにする。失敗したら throw してメニューに出す（画面の色とメモは変えない）
  const saveMark = useCallback(
    async (key: string, input: { color: string; note: string }) => {
      const r = await fetch("/api/keiri/marks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, key, ...input }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "保存できませんでした");
      setMarks(j.marks as RowMarks);
      setMenu(null);
    },
    [month],
  );
```

`const sheet = useMemo(...)` を次に置き換える（メモも検索の対象にする）:

```tsx
  const notes = useMemo(
    () => Object.fromEntries(Object.entries(marks).map(([k, m]) => [k, m.note ?? ""])),
    [marks],
  );
  const sheet = useMemo(() => (data?.cash ? buildSheet(data.cash, filter, notes) : null), [data, filter, notes]);
```

`{!loading && data?.warnings.map(...)}` の後ろに足す:

```tsx
      {marksError && <p className="warn">{marksError}</p>}
```

表の行を次に置き換える:

```tsx
      {!loading && view === "cash" && sheet && (
        <KeiriSheet sheet={sheet} marks={marks} onOpenMark={(row, at) => setMenu({ row, at })} />
      )}
      {menu && (
        <RowMarkMenu
          key={menu.row.key}
          title={`${menu.row.partner ?? menu.row.title}　${yen(menu.row.amount)}`}
          mark={marks[menu.row.key]}
          at={menu.at}
          onSave={(input) => saveMark(menu.row.key, input)}
          onClose={closeMenu}
        />
      )}
```

- [ ] **Step 4: テストと build**

Run: `npm test 2>&1 | grep -E "^✖|ℹ (pass|fail)"`
Expected: `ℹ fail 0`

Run: `npm run build > /tmp/keiri-build.log 2>&1; echo EXIT=$?; grep -E "Type error|Failed" /tmp/keiri-build.log | head`
Expected: `EXIT=0`。エラーなし

- [ ] **Step 5: Commit**

```bash
git add components/keiri/RowMarkMenu.tsx components/keiri/KeiriSheet.tsx components/keiri/KeiriMonthly.tsx
git commit -m "経理の月次: 表の行に色とメモを付ける（右クリック・メモの列）"
```

---

### Task 8: 経理メモ（申し送り）と使い方の説明、最後の確認

**Files:**
- Create: `components/keiri/MemoBoard.tsx`
- Modify: `components/keiri/KeiriMonthly.tsx`
- Modify: `lib/systemGuide.ts`

**Interfaces:**
- Consumes: `type KeiriMemo`・`MEMO_MAX`（Task 4）、`GET/POST/PATCH/DELETE /api/keiri/memos`（Task 4）
- Produces: `MemoBoard({ month }: { month: string })`

- [ ] **Step 1: `components/keiri/MemoBoard.tsx` を書く**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { MEMO_MAX, type KeiriMemo } from "@/lib/keiri/notes";
import { monthLabel } from "./format";

// 経理メモ（申し送り）。書いた月から、済みにするまで次の月以降にも出る（決まりは lib/keiri/notes.ts）。
export default function MemoBoard({ month }: { month: string }) {
  const [memos, setMemos] = useState<KeiriMemo[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /** API を呼び、返ってきた「その月に出すメモ」で一覧を置き換える。成功したら true */
  const call = useCallback(async (init: RequestInit, query: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/keiri/memos${query}`, {
        ...init,
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "経理メモを読み書きできませんでした");
      setMemos(j.memos as KeiriMemo[]);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "経理メモを読み書きできませんでした");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    setMemos([]);
    void call({ method: "GET" }, `?month=${month}`);
  }, [month, call]);

  const add = async () => {
    if (await call({ method: "POST", body: JSON.stringify({ month, text }) }, "")) setText("");
  };
  const toggle = (m: KeiriMemo) => call({ method: "PATCH", body: JSON.stringify({ month, id: m.id, done: !m.done }) }, "");
  const remove = (m: KeiriMemo) => {
    if (window.confirm("このメモを消しますか？")) void call({ method: "DELETE" }, `?month=${month}&id=${encodeURIComponent(m.id)}`);
  };

  return (
    <section className="memo" aria-label="経理メモ">
      <div className="head">
        <b>経理メモ</b>
        <span>{monthLabel(month)}分の申し送り。済みにするまで、次の月にも出ます</span>
      </div>
      <div className="add">
        <textarea
          value={text}
          maxLength={MEMO_MAX}
          rows={2}
          aria-label="経理メモを書く"
          placeholder="例）8/19のAmazonは2回払い。領収書は1枚で、もう片方は記録済み"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="button" onClick={add} disabled={busy || !text.trim()}>追加</button>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      {memos.length === 0 ? (
        <p className="empty">まだメモはありません</p>
      ) : (
        <ul>
          {memos.map((m) => (
            <li key={m.id} className={m.done ? "done" : ""}>
              {m.month !== month && <span className="from">{Number(m.month.slice(5, 7))}月から</span>}
              <span className="text">{m.text}</span>
              <button type="button" onClick={() => toggle(m)} disabled={busy}>{m.done ? "戻す" : "済み"}</button>
              <button type="button" className="del" onClick={() => remove(m)} disabled={busy}>消す</button>
            </li>
          ))}
        </ul>
      )}

      <style jsx>{`
        .memo { background: #fff8e6; border: 1px solid #f0d9a8; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; }
        .head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin-bottom: 8px; }
        .head b { color: #8a5300; }
        .head span { font-size: 12px; color: #a0782e; }
        .add { display: flex; gap: 8px; align-items: stretch; }
        textarea { flex: 1; border: 1px solid #f0d9a8; border-radius: 8px; padding: 8px; font: inherit; font-size: 13px; resize: vertical; background: #fffdf7; }
        textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
        .add button { border: 0; border-radius: 8px; padding: 0 16px; background: var(--accent); color: #fff; font-weight: 700; cursor: pointer; }
        .add button:disabled { opacity: 0.5; cursor: default; }
        .err { color: #c62828; font-size: 12px; margin: 6px 0 0; }
        .empty { margin: 8px 0 0; font-size: 12px; color: #a0782e; }
        ul { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 4px; }
        li { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
        li.done .text { text-decoration: line-through; color: var(--muted); }
        .from { font-size: 11px; color: #a0782e; white-space: nowrap; }
        .text { flex: 1; white-space: pre-wrap; }
        li button { border: 1px solid #f0d9a8; background: #fffdf7; border-radius: 6px; padding: 2px 8px; font-size: 12px; cursor: pointer; }
        li button:disabled { opacity: 0.5; cursor: default; }
        li .del { color: #c62828; }
        button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        @media print {
          .add, li button, .err { display: none; }
          .memo { background: none; }
        }
      `}</style>
    </section>
  );
}
```

- [ ] **Step 2: 月次ページに経理メモを置く（`components/keiri/KeiriMonthly.tsx`）**

import に足す:

```tsx
import MemoBoard from "./MemoBoard";
```

数字のカード（`{t && ( <section className="kpis" ...> ... )}`）の後ろ、`<div className="tools">` の前に足す:

```tsx
      {!data?.future && <MemoBoard month={month} />}
```

- [ ] **Step 3: 使い方チャットの説明を直す（`lib/systemGuide.ts`）**

`- **/keiri（月次）**: ...` の行を次に置き換える:

```
- **/keiri（月次）**: 店舗側のナビの「経理 →」から入る経理画面のトップ。経理の画面は左にサイドバー（スマホは ☰）があり、記録する・支払い・集計・書類の分野でページを選ぶ。月次は上の月のタブで月を選び、「経理で見る」はその月の入出金をエクセルのような表で出す（入金・カード・銀行・現金・立替・移動で区切って小計、検索・領収書なしだけ・未処理だけ・印刷）。行を右クリックするかメモの列を押すと色とメモを付けられ、表の上の「経理メモ」は済みにするまで次の月にも出る申し送り。「会計で見る」はfreeeの試算表から作る損益計算書（税金は見込み）。
```

- [ ] **Step 4: 全部のテストと build**

Run: `npm test 2>&1 | grep -E "^✖|ℹ (tests|pass|fail)"`
Expected: `ℹ fail 0`

Run: `npm run build > /tmp/keiri-build.log 2>&1; echo EXIT=$?; grep -E "Type error|Failed" /tmp/keiri-build.log | head`
Expected: `EXIT=0`。エラーなし

- [ ] **Step 5: Commit と push（sync）**

```bash
git add components/keiri/MemoBoard.tsx components/keiri/KeiriMonthly.tsx lib/systemGuide.ts
git commit -m "経理の月次: 経理メモ（申し送り）と使い方の説明"
git push origin sync
```

- [ ] **Step 6: 本番で確かめる（坂本さんが「mainに反映」と言ってから）**

`sync` を `main` に早送りで進めて `git push origin main`（origin の push 先は fork と origin の2本。fork が Vercel の本番）。デプロイが Ready になったら、https://flat-keihi.vercel.app で次を確かめる:

- `/keiri`・`/ryoshusho`・`/receipts`・`/zeirishi` を開くと、左にサイドバーが出て、店舗側のナビと右下の 💬 が出ない。`/table` では今まで通り店舗側のナビと 💬 が出る
- 幅 375px（スマホ）で上の帯の ☰ を押すとメニューが開き、ページを選ぶと閉じる。`/ryoshusho` の撮影ボタンが押せる
- `/keiri?month=2026-08` と `2026-10` で、数字のカードの入金・出金が今（Task 1 の前）と同じ。2026-08 は入金 ¥1,007,206・出金 ¥5,351,923（2026-10-15 時点）。表の合計の行の入金・出金が、数字のカードと同じ
- 区切りが 入金→カード→銀行→現金→立替→移動 の順で、移動は薄く「合計に入れない」と出る
- 検索に「amazon」と入れると AMAZON の行だけになり、合計の行もその分になる
- 行を右クリックして黄色とメモを付け、ページを開き直しても残る。色をなし・メモを空にして保存すると消える
- 経理メモを9月に書き、10月を開いても出る。済みにすると10月からは消え、9月では取り消し線つきで出る
- 印刷のプレビュー（Cmd+P）で、サイドバー・月のタブ・道具の帯が消え、A4横で表が出る
