# 経理画面の切り離しと月次ページ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 経理を店舗側のナビから切り離した専用画面にし、その中心に「経理で見る（お金の出入り）」「会計で見る（損益計算書）」を切り替えられる月次ページ `/keiri` を作る。

**Architecture:** freee から取ったデータを、純粋な関数（`lib/keiri/*.ts`）で画面用の行に組み立てる。API `GET /api/keiri/monthly` が freee とシステムの領収書を取り、組み立て関数に渡す。画面はクライアントコンポーネントで、月と見方を URL クエリに持つ。ナビは `components/Nav.tsx` の中で、経理のページなら経理用ナビ（`components/KeiriNav.tsx`）に出し分ける。

**Tech Stack:** Next.js 15（App Router）、React 19、TypeScript、styled-jsx（既存ページと同じ）、freee 会計 API（`lib/freee.ts`）、Vercel KV（領収書・レシートなし経費）。テストは追加の依存なしで Node 24 の `node --test`（TypeScript の型を外して実行する機能）を使う。

**Spec:** `docs/superpowers/specs/2026-10-15-keiri-monthly-design.md`

## Global Constraints

- 画面の文言はすべて日本語。金額は `¥1,234` 形式、マイナスは `−¥1,234`
- 会計年度は 6/1〜翌5/31。freee の `fiscal_year` は期首の年（2026年10月 → 2026、2027年1月 → 2026）
- 税金の見込み = 税引前当期純利益がプラスなら × 25%、どの月も均等割 5,833円（年7万円÷12）を足す。帳簿に法人税等の計上がある月は帳簿の額を使う
- 人件費 = 給料手当・雑給・法定福利費。役員報酬は別に出す。どちらも販管費に含まれ、利益の計算で二重に引かない
- 支払い方法のタグは「カード」「銀行」「現金」「立替」の4つ
- ATM の出金・入金（普通預金⇄現金の口座振替）は、入金・出金の合計に入れない
- 既存ページの URL は変えない。既存の「月次レポート」「経営」ページは触らない
- 新しい npm 依存は入れない。dev server は立てない（確認は `npm run build` と本番）
- `lib/keiri/` の純粋な関数は、実行時に他のファイルを import しない（型だけ `import type`）。テストから `.ts` 拡張子付きで読み込むため
- コミットは `sync` ブランチ。本番（`main` → fork リモート → Vercel）への反映は、坂本さんが「mainに反映」と言ってから

## Review Focus

- 同じ日・同じ金額のカード払いが2件ある（例: ¥5,000 のガソリンを同じ日に2回）→ 2件を別々の取引に割り当て、片方が「突き合わせできない」にならない（Task 3 のテスト）
- 前の月に計上して今月払った取引（例: 8/24 計上の交通費を 10/9 に振込）→ 10月の出金に出る（Task 3 のテスト）
- ATM の出金と現金の預け入れ → 一覧には出るが、入金・出金の合計には入らない（Task 3 のテスト）
- データが1件もない月・未来の月 → 空の一覧と「まだデータがありません」を出し、エラーにしない（Task 3・Task 5）
- freee の試算表が集計中（`up_to_date=false`）→ 数字は出しつつ「freeeの集計が更新中です」と出す（Task 2 のテストで値が渡ること、Task 7 で表示）

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `lib/keiri/period.ts` | 月 → 期間・会計年度、前後の月、今月（JST） |
| `lib/keiri/types.ts` | freee のデータの型と、画面に渡す行の型 |
| `lib/keiri/pl.ts` | 試算表 → 損益計算書の行、税金の見込み、科目ごとの仕訳 |
| `lib/keiri/cashflow.ts` | 口座明細・取引・振替伝票・口座振替 → 入金と出金の行 |
| `lib/keiri/linkReceipts.ts` | 出金の行に領収書・Amazon 注文・レシートなし経費を紐づけ、合計を出す |
| `lib/keiri/*.test.ts` | 上記のテスト（`node --test`） |
| `lib/keiri/__fixtures__/trial_pl_2026-09.json` | 9月の試算表（作成済み） |
| `lib/monthlyReport.ts` | `fetchAll` を export するだけ |
| `app/api/keiri/monthly/route.ts` | freee・KV から取って組み立てて返す |
| `components/KeiriNav.tsx` | 経理用ナビと `KEIRI_TABS` |
| `components/Nav.tsx` | 経理グループを外し、「経理 →」を足し、経理ページでは `KeiriNav` を出す |
| `app/keiri/page.tsx` | 月次ページ（Suspense で包むだけ） |
| `components/keiri/KeiriMonthly.tsx` | 月の移動・見方の切り替え・読み込み |
| `components/keiri/CashTable.tsx` | 経理で見る |
| `components/keiri/PlTable.tsx` | 会計で見る |
| `components/keiri/ReceiptModal.tsx` | 領収書画像を開く |
| `components/keiri/format.ts` | 金額・日付の表示 |

---

### Task 1: テストの土台と期間の計算

**Files:**
- Modify: `tsconfig.json`（`exclude` にテストを足す）
- Modify: `package.json`（`scripts.test` を足す）
- Create: `lib/keiri/period.ts`
- Test: `lib/keiri/period.test.ts`

**Interfaces:**
- Produces: `periodOf(month: string): Period`、`shiftMonth(month: string, delta: number): string`、`jstMonth(now?: number): string`、`isMonth(s: string): boolean`、`type Period = { month: string; from: string; to: string; fiscalYear: number; calendarMonth: number }`

- [ ] **Step 1: テストを `next build` の型チェックから外す**

`tsconfig.json` の `exclude` を次にする（テストは `./pl.ts` のように拡張子付きで import するため、Next の型チェックに入れない）:

```json
  "exclude": ["node_modules", "**/*.test.ts"]
```

`package.json` の `scripts` に足す:

```json
    "test": "node --test \"lib/keiri/*.test.ts\""
```

- [ ] **Step 2: 失敗するテストを書く**

`lib/keiri/period.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isMonth, jstMonth, periodOf, shiftMonth } from "./period.ts";

test("10月は期首2026年度、月末31日", () => {
  assert.deepEqual(periodOf("2026-10"), {
    month: "2026-10",
    from: "2026-10-01",
    to: "2026-10-31",
    fiscalYear: 2026,
    calendarMonth: 10,
  });
});

test("1月と5月は前の年に始まった年度", () => {
  assert.equal(periodOf("2027-01").fiscalYear, 2026);
  assert.equal(periodOf("2026-05").fiscalYear, 2025);
  assert.equal(periodOf("2026-06").fiscalYear, 2026);
});

test("うるう年の2月", () => {
  assert.equal(periodOf("2028-02").to, "2028-02-29");
});

test("年をまたぐ前後の月", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-10", -3), "2026-07");
});

test("形式が違う月は弾く", () => {
  assert.equal(isMonth("2026-13"), false);
  assert.equal(isMonth("2026-1"), false);
  assert.equal(isMonth("2026-10"), true);
  assert.throws(() => periodOf("abc"));
});

test("今月は日本時間で決める", () => {
  // UTC 9/30 16:00 = JST 10/1 01:00
  assert.equal(jstMonth(Date.UTC(2026, 8, 30, 16, 0)), "2026-10");
});
```

- [ ] **Step 3: 失敗することを確かめる**

Run: `npm test`
Expected: FAIL（`Cannot find module ... period.ts`）

- [ ] **Step 4: 実装する**

`lib/keiri/period.ts`:

```ts
// 月（YYYY-MM）から、freeeに渡す期間と会計年度を出す。
// flat.の会計年度は6/1〜翌5/31。freeeのfiscal_yearは期首の年。期首が変わったらここだけ直す。
export const FISCAL_START_MONTH = 6;

export type Period = {
  month: string;
  from: string;
  to: string;
  fiscalYear: number;
  calendarMonth: number;
};

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonth(s: string): boolean {
  return MONTH_RE.test(s);
}

export function periodOf(month: string): Period {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error(`月の形式が違います: ${month}`);
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const last = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  return {
    month,
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
    fiscalYear: mm >= FISCAL_START_MONTH ? y : y - 1,
    calendarMonth: mm,
  };
}

export function shiftMonth(month: string, delta: number): string {
  const p = periodOf(month);
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), p.calendarMonth - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function jstMonth(now: number = Date.now()): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 7);
}
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npm test`
Expected: PASS（6件）

- [ ] **Step 6: コミット**

```bash
git add tsconfig.json package.json lib/keiri/period.ts lib/keiri/period.test.ts
git commit -m "経理の月次: 月から期間と会計年度を出す関数とテストの土台"
```

---

### Task 2: 型と損益計算書の組み立て

**Files:**
- Create: `lib/keiri/types.ts`
- Create: `lib/keiri/pl.ts`
- Test: `lib/keiri/pl.test.ts`（フィクスチャ `lib/keiri/__fixtures__/trial_pl_2026-09.json` は作成済み）

**Interfaces:**
- Consumes: なし
- Produces（`types.ts`）:

```ts
export type TrialPlBalance = {
  account_item_name?: string;
  account_category_name?: string;
  total_line?: boolean;
  hierarchy_level: number;
  opening_balance: number;
  closing_balance: number;
};
export type FreeeDetail = {
  account_item_id: number;
  amount: number;
  description?: string | null;
  entry_side: "debit" | "credit";
};
export type FreeePayment = {
  date: string;
  from_walletable_type: string;
  from_walletable_id: number;
  amount: number;
};
export type FreeeDeal = {
  id: number;
  issue_date: string;
  type: "income" | "expense";
  partner_id?: number | null;
  details: FreeeDetail[];
  payments?: FreeePayment[];
};
export type FreeeJournal = { id: number; issue_date: string; details: FreeeDetail[] };
export type WalletTxn = {
  id: number;
  date: string;
  amount: number;
  description: string;
  entry_side: "income" | "expense";
  status: number; // 1 = 未処理, 2 = 処理済み
  walletable_id: number;
};
export type FreeeTransfer = {
  id: number;
  date: string;
  amount: number;
  from_walletable_id: number;
  to_walletable_id: number;
};

export type PlEntry = { date: string; description: string; amount: number; sourceType: "deal" | "journal"; sourceId: number };
export type PlAccount = { name: string; amount: number; entries: PlEntry[] };
export type PlLine = {
  key: string;
  label: string;
  amount: number;
  kind: "item" | "subtotal" | "total";
  accounts?: PlAccount[];
};
export type PlView = {
  lines: PlLine[];
  officerPay: number;
  laborCost: number;
  pretax: number;
  tax: { amount: number; estimated: boolean };
  netIncome: number;
  upToDate: boolean;
};
```

- Produces（`pl.ts`）: `buildPl(input: PlInput): PlView`、`type PlInput = { balances: TrialPlBalance[]; upToDate: boolean; deals: FreeeDeal[]; journals: FreeeJournal[]; accountNames: Map<number, string> }`、定数 `TAX_RATE = 0.25`、`KINTOWARI_MONTHLY = 5833`

- [ ] **Step 1: 型のファイルを作る**

`lib/keiri/types.ts` に、上の「Produces（types.ts）」のコードをそのまま書く。先頭に1行コメント:

```ts
// 経理の月次ページで使う型。freeeのAPIの形（必要な項目だけ）と、画面に渡す行の形。
```

（Task 3 で `CashRow` などを足す）

- [ ] **Step 2: 失敗するテストを書く**

`lib/keiri/pl.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPl, KINTOWARI_MONTHLY } from "./pl.ts";
import type { FreeeDeal, FreeeJournal, TrialPlBalance } from "./types.ts";

const fx = JSON.parse(
  readFileSync(new URL("./__fixtures__/trial_pl_2026-09.json", import.meta.url), "utf8"),
) as { up_to_date: boolean; balances: TrialPlBalance[] };

const names = new Map<number, string>([
  [1, "売上高"],
  [2, "地代家賃"],
  [3, "支払手数料"],
  [4, "普通預金"],
  [5, "消耗品費"],
  [6, "現金"],
]);

const sept = (deals: FreeeDeal[] = [], journals: FreeeJournal[] = []) =>
  buildPl({ balances: fx.balances, upToDate: fx.up_to_date, deals, journals, accountNames: names });

const line = (v: ReturnType<typeof buildPl>, key: string) => {
  const l = v.lines.find((x) => x.key === key);
  assert.ok(l, `${key} の行がない`);
  return l;
};

test("9月の各段の利益が試算表と一致する", () => {
  const v = sept();
  assert.equal(line(v, "sales").amount, 713513);
  assert.equal(line(v, "cogs").amount, 256738);
  assert.equal(line(v, "gross").amount, 456775);
  assert.equal(line(v, "sga").amount, 605339);
  assert.equal(line(v, "operating").amount, -148564);
  assert.equal(line(v, "nonOpIncome").amount, 10811);
  assert.equal(line(v, "nonOpExpense").amount, 15792);
  assert.equal(line(v, "ordinary").amount, -153545);
  assert.equal(line(v, "pretax").amount, -153545);
  assert.equal(v.pretax, -153545);
});

test("役員報酬と人件費を別に出す", () => {
  const v = sept();
  assert.equal(v.officerPay, 188997);
  assert.equal(v.laborCost, 0);
});

test("赤字の月の税金は均等割だけの見込み", () => {
  const v = sept();
  assert.deepEqual(v.tax, { amount: KINTOWARI_MONTHLY, estimated: true });
  assert.equal(v.netIncome, -153545 - 5833);
  assert.equal(line(v, "tax").label, "法人税等（見込み）");
  assert.equal(line(v, "net").label, "当期純利益（見込み）");
});

test("黒字の月の税金は25%＋均等割", () => {
  const balances = fx.balances.map((b) =>
    b.account_category_name === "税引前当期純損益金額" && b.total_line
      ? { ...b, opening_balance: 0, closing_balance: 100000 }
      : b,
  );
  const v = buildPl({ balances, upToDate: true, deals: [], journals: [], accountNames: names });
  assert.deepEqual(v.tax, { amount: 25000 + KINTOWARI_MONTHLY, estimated: true });
  assert.equal(v.netIncome, 100000 - 25000 - KINTOWARI_MONTHLY);
});

test("帳簿に法人税等がある月は帳簿の額を使う", () => {
  const balances = fx.balances.map((b) =>
    b.account_category_name === "法人税等" && b.total_line ? { ...b, closing_balance: 70000 } : b,
  );
  const v = buildPl({ balances, upToDate: true, deals: [], journals: [], accountNames: names });
  assert.deepEqual(v.tax, { amount: 70000, estimated: false });
  assert.equal(line(v, "tax").label, "法人税等");
});

test("販管費は金額が動いた科目だけ、仕訳つきで出す", () => {
  const deals: FreeeDeal[] = [
    {
      id: 10,
      issue_date: "2026-09-02",
      type: "expense",
      details: [{ account_item_id: 2, amount: 104830, description: "店舗家賃", entry_side: "debit" }],
    },
  ];
  const v = sept(deals);
  const sga = line(v, "sga").accounts ?? [];
  assert.equal(sga.find((a) => a.name === "交際費"), undefined); // 9月に動いていない
  const rent = sga.find((a) => a.name === "地代家賃");
  assert.equal(rent?.amount, 146830);
  assert.deepEqual(rent?.entries, [
    { date: "2026-09-02", description: "店舗家賃", amount: 104830, sourceType: "deal", sourceId: 10 },
  ]);
});

test("売上の仕訳は貸方をプラスで出す", () => {
  const deals: FreeeDeal[] = [
    {
      id: 11,
      issue_date: "2026-09-11",
      type: "income",
      details: [{ account_item_id: 1, amount: 11000, description: "Tシャツ", entry_side: "credit" }],
    },
  ];
  const v = sept(deals);
  const sales = line(v, "sales").accounts?.find((a) => a.name === "売上高");
  assert.equal(sales?.entries[0].amount, 11000);
});

test("振替伝票の行も科目に入る", () => {
  const journals: FreeeJournal[] = [
    {
      id: 20,
      issue_date: "2026-09-21",
      details: [
        { account_item_id: 5, amount: 2378, description: "発泡箱", entry_side: "debit" },
        { account_item_id: 6, amount: 2378, description: "発泡箱", entry_side: "credit" },
      ],
    },
  ];
  const v = sept([], journals);
  const sup = line(v, "sga").accounts?.find((a) => a.name === "消耗品費");
  assert.deepEqual(sup?.entries, [
    { date: "2026-09-21", description: "発泡箱", amount: 2378, sourceType: "journal", sourceId: 20 },
  ]);
});

test("集計中フラグをそのまま渡す", () => {
  const v = buildPl({ balances: fx.balances, upToDate: false, deals: [], journals: [], accountNames: names });
  assert.equal(v.upToDate, false);
});
```

- [ ] **Step 3: 失敗することを確かめる**

Run: `npm test`
Expected: FAIL（`Cannot find module ... pl.ts`）

- [ ] **Step 4: 実装する**

`lib/keiri/pl.ts`:

```ts
// freeeの試算表（その月だけ）から損益計算書の形に並べる。
// その月の金額は closing_balance − opening_balance。収益・費用・各段の利益のどれもこの式で月の増減になる。
import type {
  FreeeDeal,
  FreeeJournal,
  PlAccount,
  PlEntry,
  PlLine,
  PlView,
  TrialPlBalance,
} from "./types";

export const TAX_RATE = 0.25; // 中小法人の実効税率の目安
export const KINTOWARI_MONTHLY = 5833; // 法人住民税の均等割 年70,000円 ÷ 12
export const OFFICER_ACCOUNT = "役員報酬";
export const LABOR_ACCOUNTS = ["給料手当", "雑給", "法定福利費"];
const COGS_CATEGORIES = ["期首商品棚卸", "当期商品仕入", "他勘定振替高(商)", "期末商品棚卸"];

export type PlInput = {
  balances: TrialPlBalance[];
  upToDate: boolean;
  deals: FreeeDeal[];
  journals: FreeeJournal[];
  accountNames: Map<number, string>;
};

const monthly = (b: TrialPlBalance) => b.closing_balance - b.opening_balance;

function total(bal: TrialPlBalance[], category: string): number {
  const b = bal.find((x) => x.total_line && x.account_category_name === category);
  return b ? monthly(b) : 0;
}

function itemAmount(bal: TrialPlBalance[], name: string): number {
  const b = bal.find((x) => !x.total_line && x.account_item_name === name);
  return b ? monthly(b) : 0;
}

/** 科目名 → その月の仕訳（借方プラス） */
function entriesByAccount(input: PlInput): Map<string, PlEntry[]> {
  const map = new Map<string, PlEntry[]>();
  const add = (
    name: string | undefined,
    e: Omit<PlEntry, "amount">,
    amount: number,
    side: "debit" | "credit",
  ) => {
    if (!name) return;
    const list = map.get(name) ?? [];
    list.push({ ...e, amount: side === "debit" ? amount : -amount });
    map.set(name, list);
  };
  for (const d of input.deals) {
    for (const x of d.details) {
      add(
        input.accountNames.get(x.account_item_id),
        { date: d.issue_date, description: x.description ?? "", sourceType: "deal", sourceId: d.id },
        x.amount,
        x.entry_side,
      );
    }
  }
  for (const j of input.journals) {
    for (const x of j.details) {
      add(
        input.accountNames.get(x.account_item_id),
        { date: j.issue_date, description: x.description ?? "", sourceType: "journal", sourceId: j.id },
        x.amount,
        x.entry_side,
      );
    }
  }
  for (const list of map.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return map;
}

function accountsUnder(
  bal: TrialPlBalance[],
  categories: string[],
  entries: Map<string, PlEntry[]>,
  creditPositive = false,
): PlAccount[] {
  return bal
    .filter((b) => !b.total_line && b.account_item_name && categories.includes(b.account_category_name ?? ""))
    .map((b) => {
      const name = b.account_item_name as string;
      const list = (entries.get(name) ?? []).map((e) => (creditPositive ? { ...e, amount: -e.amount } : e));
      return { name, amount: monthly(b), entries: list };
    })
    .filter((a) => a.amount !== 0 || a.entries.length > 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

export function buildPl(input: PlInput): PlView {
  const bal = input.balances;
  const entries = entriesByAccount(input);

  const sales = total(bal, "売上高");
  const cogs = total(bal, "売上原価");
  const gross = total(bal, "売上総損益金額");
  const sga = total(bal, "販売管理費");
  const operating = total(bal, "営業損益金額");
  const nonOpIncome = total(bal, "営業外収益");
  const nonOpExpense = total(bal, "営業外費用");
  const ordinary = total(bal, "経常損益金額");
  const extraGain = total(bal, "特別利益");
  const extraLoss = total(bal, "特別損失");
  const pretax = total(bal, "税引前当期純損益金額");
  const bookedTax = total(bal, "法人税等");
  const taxAdjust = total(bal, "法人税等調整額");

  const tax =
    bookedTax !== 0
      ? { amount: bookedTax, estimated: false }
      : { amount: (pretax > 0 ? Math.round(pretax * TAX_RATE) : 0) + KINTOWARI_MONTHLY, estimated: true };
  const netIncome = pretax - tax.amount - taxAdjust;
  const est = tax.estimated ? "（見込み）" : "";

  const lines: PlLine[] = [
    { key: "sales", label: "売上高", amount: sales, kind: "item", accounts: accountsUnder(bal, ["売上高"], entries, true) },
    { key: "cogs", label: "売上原価", amount: cogs, kind: "item", accounts: accountsUnder(bal, COGS_CATEGORIES, entries) },
    { key: "gross", label: "売上総利益（粗利）", amount: gross, kind: "subtotal" },
    { key: "sga", label: "販売費及び一般管理費", amount: sga, kind: "item", accounts: accountsUnder(bal, ["販売管理費"], entries) },
    { key: "operating", label: "営業利益", amount: operating, kind: "subtotal" },
    { key: "nonOpIncome", label: "営業外収益", amount: nonOpIncome, kind: "item", accounts: accountsUnder(bal, ["営業外収益"], entries, true) },
    { key: "nonOpExpense", label: "営業外費用", amount: nonOpExpense, kind: "item", accounts: accountsUnder(bal, ["営業外費用"], entries) },
    { key: "ordinary", label: "経常利益", amount: ordinary, kind: "subtotal" },
    { key: "extraGain", label: "特別利益", amount: extraGain, kind: "item", accounts: accountsUnder(bal, ["特別利益"], entries, true) },
    { key: "extraLoss", label: "特別損失", amount: extraLoss, kind: "item", accounts: accountsUnder(bal, ["特別損失"], entries) },
    { key: "pretax", label: "税引前当期純利益", amount: pretax, kind: "subtotal" },
    { key: "tax", label: `法人税等${est}`, amount: tax.amount, kind: "item" },
    { key: "net", label: `当期純利益${est}`, amount: netIncome, kind: "total" },
  ];

  return {
    lines,
    officerPay: itemAmount(bal, OFFICER_ACCOUNT),
    laborCost: LABOR_ACCOUNTS.reduce((s, n) => s + itemAmount(bal, n), 0),
    pretax,
    tax,
    netIncome,
    upToDate: input.upToDate,
  };
}
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npm test`
Expected: PASS（period 6件 + pl 9件）

- [ ] **Step 6: コミット**

```bash
git add lib/keiri/types.ts lib/keiri/pl.ts lib/keiri/pl.test.ts lib/keiri/__fixtures__/trial_pl_2026-09.json
git commit -m "経理の月次: 試算表から損益計算書と税金の見込みを組み立てる"
```

---

### Task 3: お金の出入り（経理で見る）の組み立て

**Files:**
- Modify: `lib/keiri/types.ts`（末尾に追記）
- Create: `lib/keiri/cashflow.ts`
- Test: `lib/keiri/cashflow.test.ts`

**Interfaces:**
- Consumes: `types.ts` の `FreeeDeal`, `FreeeJournal`, `WalletTxn`, `FreeeTransfer`, `FreeePayment`
- Produces（`types.ts` に追記）:

```ts
export type PayTag = "card" | "bank" | "cash" | "tatekae";
export type ReceiptStatus = "attached" | "amazon" | "missing" | "missing-recorded" | "n/a";
export type CashRow = {
  key: string;
  date: string;
  amount: number;
  title: string; // 店名・振込先など
  detail: string; // 科目と摘要
  kind: "sales" | "other" | "expense" | "move"; // move = 口座⇄現金の移動（合計に入れない）
  tag?: PayTag; // 出金だけ
  processed: boolean; // freeeで処理済みか
  partner?: string;
  dealId?: number;
  journalId?: number;
  walletTxnId?: number;
  receipt?: { id: string; vendor: string };
  amazonOrderId?: string;
  receiptStatus?: ReceiptStatus;
};
export type CashTotals = { in: number; out: number; net: number; missingReceipts: number; unprocessed: number };
export type CashView = { inflows: CashRow[]; outflows: CashRow[]; totals: CashTotals };
export type CashInput = {
  month: { from: string; to: string };
  bankWalletableId: number;
  cashWalletableId: number;
  squareOtherWalletableId: number;
  walletTxns: WalletTxn[]; // 普通預金のその月の明細
  deals: FreeeDeal[]; // 支払日がその月にある取引（計上日が前の月の取引も含めて渡す）
  journals: FreeeJournal[]; // その月の振替伝票
  transfers: FreeeTransfer[]; // その月の口座振替
  accountNames: Map<number, string>;
  partnerNames: Map<number, string>;
};
```

- Produces（`cashflow.ts`）: `buildCash(input: CashInput): CashView`（`totals.missingReceipts` は 0 のまま。Task 4 で数える）、`cleanBankText(s: string): string`、`summarize(inflows: CashRow[], outflows: CashRow[]): CashTotals`

- [ ] **Step 1: 型を追記する**

`lib/keiri/types.ts` の末尾に、上の「Produces（types.ts に追記）」のコードを足す。

- [ ] **Step 2: 失敗するテストを書く**

`lib/keiri/cashflow.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCash, cleanBankText } from "./cashflow.ts";
import type { CashInput, FreeeDeal, WalletTxn } from "./types.ts";

const BANK = 100;
const CASH = 200;
const SQ_OTHER = 300;

const names = new Map<number, string>([
  [1, "売上高"],
  [2, "売掛金"],
  [3, "車両費"],
  [4, "旅費交通費"],
  [5, "役員貸付金"],
  [6, "消耗品費"],
  [7, "現金"],
  [8, "役員借入金"],
  [9, "普通預金"],
]);

const base = (over: Partial<CashInput>): CashInput => ({
  month: { from: "2026-10-01", to: "2026-10-31" },
  bankWalletableId: BANK,
  cashWalletableId: CASH,
  squareOtherWalletableId: SQ_OTHER,
  walletTxns: [],
  deals: [],
  journals: [],
  transfers: [],
  accountNames: names,
  partnerNames: new Map([[50, "町田創"]]),
  ...over,
});

const txn = (id: number, date: string, amount: number, description: string, side: "income" | "expense", status = 2): WalletTxn => ({
  id, date, amount, description, entry_side: side, status, walletable_id: BANK,
});

const expenseDeal = (id: number, issue: string, payDate: string, amount: number, account: number, desc: string, from = BANK): FreeeDeal => ({
  id,
  issue_date: issue,
  type: "expense",
  details: [{ account_item_id: account, amount, description: desc, entry_side: "debit" }],
  payments: [{ date: payDate, from_walletable_type: from === BANK ? "bank_account" : "wallet", from_walletable_id: from, amount }],
});

test("カード明細の店名を読みやすくする", () => {
  assert.equal(
    cleanBankText("Visaデビット利用 ｱﾎﾟﾛｽﾃ-ｼﾖﾝ 承認番号：598472 TID：386280386997987"),
    "ｱﾎﾟﾛｽﾃ-ｼﾖﾝ",
  );
  assert.equal(cleanBankText("振込 ミズホ マチダ　シヨウ"), "振込 ミズホ マチダ シヨウ");
});

test("同じ日・同じ金額のカード払い2件を別々の取引に割り当てる", () => {
  const v = buildCash(base({
    walletTxns: [
      txn(1, "2026-10-11", 5000, "Visaデビット利用 ｱﾎﾟﾛｽﾃ-ｼﾖﾝ 承認番号：1", "expense"),
      txn(2, "2026-10-11", 5000, "Visaデビット利用 ｱﾎﾟﾛｽﾃ-ｼﾖﾝ 承認番号：2", "expense"),
    ],
    deals: [
      expenseDeal(11, "2026-10-11", "2026-10-11", 5000, 3, "ガソリン1"),
      expenseDeal(12, "2026-10-11", "2026-10-11", 5000, 3, "ガソリン2"),
    ],
  }));
  assert.deepEqual(v.outflows.map((r) => r.dealId).sort(), [11, 12]);
  assert.ok(v.outflows.every((r) => r.tag === "card" && r.kind === "expense"));
});

test("前の月に計上して今月払った取引も今月の出金に出る", () => {
  const v = buildCash(base({
    walletTxns: [txn(3, "2026-10-09", 40775, "振込 ユウチヨ スエヨシ ユメノ", "expense")],
    deals: [expenseDeal(13, "2026-08-24", "2026-10-09", 40775, 4, "航空券")],
  }));
  assert.equal(v.outflows.length, 1);
  assert.equal(v.outflows[0].dealId, 13);
  assert.equal(v.outflows[0].tag, "bank");
  assert.match(v.outflows[0].detail, /旅費交通費/);
});

test("ATMの出金と現金の預け入れは合計に入れない", () => {
  const v = buildCash(base({
    walletTxns: [
      txn(4, "2026-10-12", 9000, "ATM セブン銀行", "expense"),
      txn(5, "2026-10-20", 50000, "現金預入", "income"),
    ],
    transfers: [
      { id: 1, date: "2026-10-12", amount: 9000, from_walletable_id: BANK, to_walletable_id: CASH },
      { id: 2, date: "2026-10-20", amount: 50000, from_walletable_id: CASH, to_walletable_id: BANK },
    ],
  }));
  assert.equal(v.outflows[0].kind, "move");
  assert.equal(v.inflows[0].kind, "move");
  assert.equal(v.totals.out, 0);
  assert.equal(v.totals.in, 0);
});

test("入金は売上金とその他に分ける", () => {
  const v = buildCash(base({
    walletTxns: [
      txn(6, "2026-10-09", 84609, "振込 スクエア（カ", "income"),
      txn(7, "2026-10-02", 140669, "振込 PAYPAY", "income"),
      txn(8, "2026-10-12", 50000, "振込 マチダ シヨウ", "income"),
    ],
    deals: [
      { id: 20, issue_date: "2026-10-09", type: "income", details: [{ account_item_id: 2, amount: 84609, entry_side: "credit" }], payments: [{ date: "2026-10-09", from_walletable_type: "bank_account", from_walletable_id: BANK, amount: 84609 }] },
      { id: 21, issue_date: "2026-10-12", type: "income", partner_id: 50, details: [{ account_item_id: 5, amount: 50000, description: "返済", entry_side: "credit" }], payments: [{ date: "2026-10-12", from_walletable_type: "bank_account", from_walletable_id: BANK, amount: 50000 }] },
    ],
    transfers: [{ id: 3, date: "2026-10-02", amount: 140669, from_walletable_id: SQ_OTHER, to_walletable_id: BANK }],
  }));
  const kinds = Object.fromEntries(v.inflows.map((r) => [r.amount, r.kind]));
  assert.deepEqual(kinds, { 84609: "sales", 140669: "sales", 50000: "other" });
  assert.equal(v.inflows.find((r) => r.amount === 50000)?.partner, "町田創");
  assert.equal(v.totals.in, 84609 + 140669 + 50000);
});

test("現金売上は日ごとにまとめる", () => {
  const sq = (id: number, date: string, cash: number): FreeeDeal => ({
    id, issue_date: date, type: "income",
    details: [{ account_item_id: 1, amount: cash + 1000, entry_side: "credit" }],
    payments: [
      { date, from_walletable_type: "wallet", from_walletable_id: CASH, amount: cash },
      { date, from_walletable_type: "wallet", from_walletable_id: SQ_OTHER, amount: 1000 },
    ],
  });
  const v = buildCash(base({ deals: [sq(30, "2026-10-03", 3000), sq(31, "2026-10-03", 2000), sq(32, "2026-10-04", 500)] }));
  assert.deepEqual(
    v.inflows.map((r) => [r.date, r.amount, r.kind, r.title]),
    [["2026-10-03", 5000, "sales", "現金売上（レジ）"], ["2026-10-04", 500, "sales", "現金売上（レジ）"]],
  );
});

test("現金払い・立替の振替伝票は出金に出す。普通預金への預け入れは除く", () => {
  const v = buildCash(base({
    journals: [
      { id: 40, issue_date: "2026-10-11", details: [
        { account_item_id: 6, amount: 2378, description: "発泡箱", entry_side: "debit" },
        { account_item_id: 7, amount: 2378, description: "CAINZ", entry_side: "credit" },
      ] },
      { id: 41, issue_date: "2026-10-15", details: [
        { account_item_id: 6, amount: 980, description: "紙皿", entry_side: "debit" },
        { account_item_id: 8, amount: 980, description: "平和堂", entry_side: "credit" },
      ] },
      { id: 42, issue_date: "2026-10-20", details: [
        { account_item_id: 9, amount: 50000, entry_side: "debit" },
        { account_item_id: 7, amount: 50000, entry_side: "credit" },
      ] },
    ],
  }));
  assert.deepEqual(v.outflows.map((r) => [r.journalId, r.tag, r.amount]), [[40, "cash", 2378], [41, "tatekae", 980]]);
});

test("現金で払った取引は現金タグ", () => {
  const v = buildCash(base({ deals: [expenseDeal(50, "2026-10-05", "2026-10-05", 1200, 6, "ガムテープ", CASH)] }));
  assert.equal(v.outflows[0].tag, "cash");
  assert.equal(v.outflows[0].dealId, 50);
});

test("未処理の明細は未処理として数える", () => {
  const v = buildCash(base({
    walletTxns: [txn(9, "2026-10-13", 17057, "Visaデビット利用 AMAZON CO JP 承認番号：1", "expense", 1)],
  }));
  assert.equal(v.outflows[0].processed, false);
  assert.equal(v.outflows[0].tag, "card");
  assert.equal(v.totals.unprocessed, 1);
  assert.equal(v.totals.out, 17057);
});

test("データがない月は空で返す", () => {
  const v = buildCash(base({}));
  assert.deepEqual(v, { inflows: [], outflows: [], totals: { in: 0, out: 0, net: 0, missingReceipts: 0, unprocessed: 0 } });
});

test("月の外の明細・支払いは入れない", () => {
  const v = buildCash(base({
    walletTxns: [txn(10, "2026-09-30", 100, "振込 X", "expense")],
    deals: [expenseDeal(60, "2026-09-30", "2026-09-30", 100, 6, "前月")],
  }));
  assert.equal(v.outflows.length, 0);
});

test("出金・入金は日付順", () => {
  const v = buildCash(base({
    walletTxns: [
      txn(11, "2026-10-20", 300, "振込 B", "expense", 1),
      txn(12, "2026-10-02", 100, "振込 A", "expense", 1),
    ],
  }));
  assert.deepEqual(v.outflows.map((r) => r.date), ["2026-10-02", "2026-10-20"]);
});
```

- [ ] **Step 3: 失敗することを確かめる**

Run: `npm test`
Expected: FAIL（`Cannot find module ... cashflow.ts`）

- [ ] **Step 4: 実装する**

`lib/keiri/cashflow.ts`:

```ts
// 「経理で見る」の行を作る。普通預金の明細を起点に、freeeの取引・口座振替と突き合わせ、
// 現金売上（Squareの現金分）と、現金払い・立替の振替伝票を足して、日付順に並べる。
// freeeのAPIは明細と取引の対応を返さないので、取引の支払い（口座・日付・金額）で突き合わせる。
import type {
  CashInput,
  CashRow,
  CashTotals,
  CashView,
  FreeeDeal,
  FreeePayment,
  FreeeTransfer,
  PayTag,
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

function dealText(deal: FreeeDeal, names: Map<number, string>): { accounts: string[]; text: string } {
  const accounts = [...new Set(deal.details.map((d) => names.get(d.account_item_id) ?? "不明"))];
  const desc = deal.details.map((d) => d.description).find((x) => !!x) ?? "";
  return { accounts, text: desc ? `${accounts.join("・")}／${desc}` : accounts.join("・") };
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
    unprocessed: [...inflows, ...outflows].filter((r) => !r.processed).length,
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

  const inflows: CashRow[] = [];
  const outflows: CashRow[] = [];

  for (const t of input.walletTxns) {
    if (!inMonth(t.date, month)) continue;
    const base = {
      key: `w${t.id}`,
      date: t.date,
      amount: t.amount,
      title: cleanBankText(t.description),
      walletTxnId: t.id,
      processed: t.status !== 1,
    };
    const tag: PayTag = isCard(t.description) ? "card" : "bank";

    const ref = pays.get(`${input.bankWalletableId}|${t.date}|${t.amount}`)?.shift();
    if (ref) {
      const s = dealText(ref.deal, names);
      const partner = ref.deal.partner_id ? input.partnerNames.get(ref.deal.partner_id) : undefined;
      if (t.entry_side === "income") {
        const kind = s.accounts.some((a) => SALES_ACCOUNTS.includes(a)) ? "sales" : "other";
        inflows.push({ ...base, detail: s.text, kind, partner, dealId: ref.deal.id });
      } else {
        outflows.push({ ...base, detail: s.text, kind: "expense", tag, partner, dealId: ref.deal.id });
      }
      continue;
    }

    const tr = takeTransfer(t.date, t.amount, t.entry_side);
    if (tr) {
      if (t.entry_side === "income") {
        if (tr.from_walletable_id === input.squareOtherWalletableId) {
          inflows.push({ ...base, detail: "売上金（PayPayなど・Square経由）", kind: "sales" });
        } else if (tr.from_walletable_id === input.cashWalletableId) {
          inflows.push({ ...base, detail: "現金の預け入れ", kind: "move" });
        } else {
          inflows.push({ ...base, detail: "口座振替", kind: "other" });
        }
      } else {
        const toCash = tr.to_walletable_id === input.cashWalletableId;
        outflows.push({ ...base, detail: toCash ? "現金へ移動" : "口座振替", kind: toCash ? "move" : "expense", tag: "bank" });
      }
      continue;
    }

    const detail = t.status === 1 ? "未処理（freeeでまだ登録していない）" : "freeeの取引と突き合わせできませんでした";
    if (t.entry_side === "income") inflows.push({ ...base, detail, kind: "other" });
    else outflows.push({ ...base, detail, kind: "expense", tag });
  }

  // 現金の動き: Squareの現金売上は日ごとに合計、現金で払った支出の取引はそのまま
  const cashSales = new Map<string, number>();
  for (const deal of input.deals) {
    for (const p of deal.payments ?? []) {
      if (p.from_walletable_id !== input.cashWalletableId || !inMonth(p.date, month)) continue;
      if (deal.type === "income") {
        cashSales.set(p.date, (cashSales.get(p.date) ?? 0) + p.amount);
      } else {
        const s = dealText(deal, names);
        const partner = deal.partner_id ? input.partnerNames.get(deal.partner_id) : undefined;
        outflows.push({
          key: `d${deal.id}-${p.date}-${p.amount}`,
          date: p.date,
          amount: p.amount,
          title: partner ?? s.text,
          detail: s.text,
          kind: "expense",
          tag: "cash",
          processed: true,
          partner,
          dealId: deal.id,
        });
      }
    }
  }
  for (const [date, amount] of cashSales) {
    inflows.push({
      key: `cash-${date}`,
      date,
      amount,
      title: "現金売上（レジ）",
      detail: "Square連携の売上のうち現金で受け取った分",
      kind: "sales",
      processed: true,
    });
  }

  // 振替伝票: 貸方が現金 → 現金払い、役員借入金 → 立替。普通預金への預け入れは出費ではないので除く
  for (const j of input.journals) {
    if (!inMonth(j.issue_date, month)) continue;
    const debits = j.details.filter((d) => d.entry_side === "debit");
    const accounts = [...new Set(debits.map((d) => names.get(d.account_item_id) ?? "不明"))];
    if (accounts.includes("普通預金")) continue;
    for (const c of j.details.filter((d) => d.entry_side === "credit")) {
      const credit = names.get(c.account_item_id);
      const tag: PayTag | undefined = credit === "現金" ? "cash" : credit === "役員借入金" ? "tatekae" : undefined;
      if (!tag) continue;
      const desc = c.description || debits.map((d) => d.description).find((x) => !!x) || "";
      outflows.push({
        key: `j${j.id}-${c.amount}`,
        date: j.issue_date,
        amount: c.amount,
        title: desc || accounts.join("・"),
        detail: accounts.join("・"),
        kind: "expense",
        tag,
        processed: true,
        journalId: j.id,
      });
    }
  }

  inflows.sort(byDate);
  outflows.sort(byDate);
  return { inflows, outflows, totals: summarize(inflows, outflows) };
}
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npm test`
Expected: PASS（period 6件 + pl 9件 + cashflow 12件）

- [ ] **Step 6: コミット**

```bash
git add lib/keiri/types.ts lib/keiri/cashflow.ts lib/keiri/cashflow.test.ts
git commit -m "経理の月次: 口座明細と取引を突き合わせて入金・出金の行を作る"
```

---

### Task 4: 領収書との紐づけ

**Files:**
- Create: `lib/keiri/linkReceipts.ts`
- Test: `lib/keiri/linkReceipts.test.ts`

**Interfaces:**
- Consumes: `CashRow`, `ReceiptStatus`（Task 3 の型）。合計（領収書なしの件数を含む）は、紐づけた後に route 側で `summarize` を呼び直して出す（`lib/keiri/` 同士は実行時に import しない決まりのため）
- Produces: `attachReceipts(rows: CashRow[], receipts: ReceiptRef[], pending: PendingRef[]): CashRow[]`、`type ReceiptRef = { id: string; vendor: string; registered?: { journalId: number } }`、`type PendingRef = { date: string; amount: number; status: string; tags?: string[] }`

ルール:
- 出金のうち `kind === "expense"` の行だけを見る（`move` は `n/a`）
- 領収書の `registered.journalId` が、行の `dealId` または `journalId` と一致 → `attached`
- 見つからず、詳細に `Amazon 注文250-1506470-9347845` の形がある → `amazon`（`amazonOrderId` に注文番号）
- 見つからず、タグが `card` / `cash` / `tatekae`:
  - レシートなし経費に、同じ日付・同じ金額・タグ `詳細未登録`・状態が `skipped` 以外のものがある → `missing-recorded`
  - それ以外 → `missing`
- タグが `bank` で見つからない → `n/a`（家賃・役員報酬などの振込は領収書を求めない）

- [ ] **Step 1: 失敗するテストを書く**

`lib/keiri/linkReceipts.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { attachReceipts } from "./linkReceipts.ts";
import type { CashRow } from "./types.ts";

const row = (over: Partial<CashRow>): CashRow => ({
  key: "k", date: "2026-10-11", amount: 1000, title: "t", detail: "消耗品費", kind: "expense", tag: "card", processed: true, ...over,
});

test("取引IDで領収書を紐づける", () => {
  const [r] = attachReceipts([row({ dealId: 3841164150 })], [{ id: "r_1", vendor: "ドン・キホーテ", registered: { journalId: 3841164150 } }], []);
  assert.equal(r.receiptStatus, "attached");
  assert.deepEqual(r.receipt, { id: "r_1", vendor: "ドン・キホーテ" });
});

test("振替伝票IDでも紐づける（現金払い）", () => {
  const [r] = attachReceipts([row({ tag: "cash", journalId: 3841192254 })], [{ id: "r_2", vendor: "CAINZ", registered: { journalId: 3841192254 } }], []);
  assert.equal(r.receiptStatus, "attached");
});

test("Amazonは注文番号で確認する", () => {
  const [r] = attachReceipts([row({ dealId: 9, detail: "消耗品費／手すり（Amazon 注文250-1506470-9347845）" })], [], []);
  assert.equal(r.receiptStatus, "amazon");
  assert.equal(r.amazonOrderId, "250-1506470-9347845");
});

test("レシートなし経費に記録があれば『記録済み』", () => {
  const rows = attachReceipts(
    [row({ dealId: 1, date: "2026-10-05", amount: 28140 }), row({ dealId: 2, date: "2026-10-07", amount: 276 })],
    [],
    [
      { date: "2026-10-05", amount: 28140, status: "pending", tags: ["詳細未登録"] },
      { date: "2026-10-07", amount: 276, status: "skipped", tags: ["詳細未登録"] },
    ],
  );
  assert.deepEqual(rows.map((r) => r.receiptStatus), ["missing-recorded", "missing"]);
});

test("銀行振込は領収書を求めない。ATMの移動も対象外", () => {
  const rows = attachReceipts([row({ tag: "bank", dealId: 5 }), row({ tag: "bank", kind: "move" })], [], []);
  assert.deepEqual(rows.map((r) => r.receiptStatus), ["n/a", "n/a"]);
});

test("入金の行には何も付けない", () => {
  const rows = attachReceipts([row({ kind: "sales", tag: undefined })], [], []);
  assert.equal(rows[0].receiptStatus, undefined);
});
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `npm test`
Expected: FAIL（`Cannot find module ... linkReceipts.ts`）

- [ ] **Step 3: 実装する**

`lib/keiri/linkReceipts.ts`:

```ts
// 出金の行に、システムの領収書・Amazonの注文番号・「レシートなし経費」の記録を紐づける。
// 領収書は freee 登録時に registered.journalId（取引IDまたは振替伝票ID）を持つので、それで引く。
import type { CashRow, ReceiptStatus } from "./types";

export type ReceiptRef = { id: string; vendor: string; registered?: { journalId: number } };
export type PendingRef = { date: string; amount: number; status: string; tags?: string[] };

const AMAZON_ORDER = /Amazon 注文(\d{3}-\d{7}-\d{7})/;
const NO_RECEIPT_TAG = "詳細未登録";

export function attachReceipts(rows: CashRow[], receipts: ReceiptRef[], pending: PendingRef[]): CashRow[] {
  const byJournal = new Map<number, ReceiptRef>();
  for (const r of receipts) if (r.registered?.journalId) byJournal.set(r.registered.journalId, r);
  const recorded = new Set(
    pending
      .filter((p) => p.status !== "skipped" && (p.tags ?? []).includes(NO_RECEIPT_TAG))
      .map((p) => `${p.date}|${p.amount}`),
  );

  return rows.map((row) => {
    if (row.kind === "move") return { ...row, receiptStatus: "n/a" as ReceiptStatus };
    if (row.kind !== "expense") return row;

    const id = row.dealId ?? row.journalId;
    const hit = id ? byJournal.get(id) : undefined;
    if (hit) return { ...row, receiptStatus: "attached", receipt: { id: hit.id, vendor: hit.vendor } };

    const order = AMAZON_ORDER.exec(row.detail);
    if (order) return { ...row, receiptStatus: "amazon", amazonOrderId: order[1] };

    if (row.tag === "bank") return { ...row, receiptStatus: "n/a" };
    const status: ReceiptStatus = recorded.has(`${row.date}|${row.amount}`) ? "missing-recorded" : "missing";
    return { ...row, receiptStatus: status };
  });
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test`
Expected: PASS（全33件）

- [ ] **Step 5: コミット**

```bash
git add lib/keiri/linkReceipts.ts lib/keiri/linkReceipts.test.ts
git commit -m "経理の月次: 出金の行に領収書・Amazon注文・レシートなし記録を紐づける"
```

---

### Task 5: API `GET /api/keiri/monthly`

**Files:**
- Modify: `lib/monthlyReport.ts:157`（`async function fetchAll` → `export async function fetchAll`）
- Create: `app/api/keiri/monthly/route.ts`

**Interfaces:**
- Consumes: `periodOf`, `shiftMonth`, `jstMonth`, `isMonth`（Task 1）、`buildPl`（Task 2）、`buildCash`, `summarize`（Task 3）、`attachReceipts`（Task 4）、`fetchAll`（`lib/monthlyReport.ts`）、`freeeGet`, `isConnected`, `FREEE_COMPANY_ID`（`lib/freee.ts`）、`getReceipts`（`lib/receipts.ts`）、`getPendingExpenses`（`lib/pending-expenses.ts`）
- Produces: `GET /api/keiri/monthly?month=YYYY-MM&view=cash|pl` → `KeiriMonthlyResponse`

```ts
export type KeiriMonthlyResponse = {
  month: string;
  prev: string;
  next: string | null; // 今月より先には進めない
  view: "cash" | "pl";
  future: boolean;
  cash?: CashView;
  pl?: PlView;
  warnings: string[];
};
```

- [ ] **Step 1: `fetchAll` を export する**

`lib/monthlyReport.ts` の `async function fetchAll<T>(` の行の先頭に `export ` を付ける。中身は変えない。

- [ ] **Step 2: route を書く**

`app/api/keiri/monthly/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, isConnected } from "@/lib/freee";
import { fetchAll } from "@/lib/monthlyReport";
import { getReceipts } from "@/lib/receipts";
import { getPendingExpenses } from "@/lib/pending-expenses";
import { isMonth, jstMonth, periodOf, shiftMonth } from "@/lib/keiri/period";
import { buildPl } from "@/lib/keiri/pl";
import { buildCash, summarize } from "@/lib/keiri/cashflow";
import { attachReceipts } from "@/lib/keiri/linkReceipts";
import type {
  CashView,
  FreeeDeal,
  FreeeJournal,
  FreeeTransfer,
  PlView,
  TrialPlBalance,
  WalletTxn,
} from "@/lib/keiri/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export type KeiriMonthlyResponse = {
  month: string;
  prev: string;
  next: string | null;
  view: "cash" | "pl";
  future: boolean;
  cash?: CashView;
  pl?: PlView;
  warnings: string[];
};

type Walletable = { id: number; name: string; type: string };
const Q = { company_id: FREEE_COMPANY_ID };

async function accountNames(): Promise<Map<number, string>> {
  const r = await freeeGet<{ account_items: { id: number; name: string }[] }>("/api/1/account_items", Q);
  return new Map((r.account_items ?? []).map((a) => [a.id, a.name]));
}

// GET /api/keiri/monthly?month=2026-10&view=cash|pl
//   経理画面の月次ページ用。cash = お金の出入り（日付順）、pl = 損益計算書
export async function GET(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続です" }, { status: 400 });
  }
  const thisMonth = jstMonth();
  const raw = req.nextUrl.searchParams.get("month") ?? "";
  const month = isMonth(raw) ? raw : thisMonth;
  const view = req.nextUrl.searchParams.get("view") === "pl" ? "pl" : "cash";
  const res: KeiriMonthlyResponse = {
    month,
    prev: shiftMonth(month, -1),
    next: month < thisMonth ? shiftMonth(month, 1) : null,
    view,
    future: month > thisMonth,
    warnings: [],
  };
  if (res.future) return NextResponse.json(res);

  const p = periodOf(month);
  try {
    if (view === "pl") {
      const [trial, deals, journals, names] = await Promise.all([
        freeeGet<{ trial_pl: { balances: TrialPlBalance[] }; up_to_date: boolean }>("/api/1/reports/trial_pl", {
          ...Q,
          fiscal_year: String(p.fiscalYear),
          start_month: String(p.calendarMonth),
          end_month: String(p.calendarMonth),
          account_item_display_type: "account_item",
        }),
        fetchAll<FreeeDeal>("/api/1/deals", "deals", { ...Q, start_issue_date: p.from, end_issue_date: p.to }),
        fetchAll<FreeeJournal>("/api/1/manual_journals", "manual_journals", { ...Q, start_issue_date: p.from, end_issue_date: p.to }),
        accountNames(),
      ]);
      res.pl = buildPl({ balances: trial.trial_pl.balances, upToDate: trial.up_to_date, deals, journals, accountNames: names });
      if (!trial.up_to_date) res.warnings.push("freeeの集計が更新中です。少し待って開き直すと最新になります。");
      return NextResponse.json(res);
    }

    const { walletables } = await freeeGet<{ walletables: Walletable[] }>("/api/1/walletables", Q);
    const bank = walletables.find((w) => w.type === "bank_account");
    const cash = walletables.find((w) => w.name === "現金");
    const sqOther = walletables.find((w) => w.name === "Squareその他");
    if (!bank || !cash || !sqOther) {
      return NextResponse.json({ error: "freeeの口座（普通預金・現金・Squareその他）が見つかりません" }, { status: 500 });
    }
    // 前の月に計上して今月払った取引も拾うため、計上日は3か月前から取る
    const dealFrom = `${shiftMonth(month, -3)}-01`;
    const [walletTxns, deals, journals, transfers, partners, names] = await Promise.all([
      fetchAll<WalletTxn>("/api/1/wallet_txns", "wallet_txns", {
        ...Q,
        walletable_type: "bank_account",
        walletable_id: String(bank.id),
        start_date: p.from,
        end_date: p.to,
      }),
      fetchAll<FreeeDeal>("/api/1/deals", "deals", { ...Q, start_issue_date: dealFrom, end_issue_date: p.to }),
      fetchAll<FreeeJournal>("/api/1/manual_journals", "manual_journals", { ...Q, start_issue_date: p.from, end_issue_date: p.to }),
      fetchAll<FreeeTransfer>("/api/1/transfers", "transfers", { ...Q, start_date: p.from, end_date: p.to }),
      fetchAll<{ id: number; name: string }>("/api/1/partners", "partners", Q),
      accountNames(),
    ]);
    const built = buildCash({
      month: { from: p.from, to: p.to },
      bankWalletableId: bank.id,
      cashWalletableId: cash.id,
      squareOtherWalletableId: sqOther.id,
      walletTxns,
      deals,
      journals,
      transfers,
      accountNames: names,
      partnerNames: new Map(partners.map((x) => [x.id, x.name])),
    });

    let outflows = built.outflows;
    try {
      const [receipts, pending] = await Promise.all([getReceipts(), getPendingExpenses()]);
      outflows = attachReceipts(outflows, receipts, pending);
    } catch {
      res.warnings.push("領収書を読み込めませんでした。領収書の欄は空のまま表示しています。");
    }
    res.cash = { inflows: built.inflows, outflows, totals: summarize(built.inflows, outflows) };
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "読み込みに失敗しました" }, { status: 500 });
  }
}
```

- [ ] **Step 3: ビルドが通ることを確かめる**

Run: `npm run build`
Expected: 成功。`/api/keiri/monthly` がルート一覧に出る

- [ ] **Step 4: テストがまだ通ることを確かめる**

Run: `npm test`
Expected: PASS（全33件）

- [ ] **Step 5: コミット**

```bash
git add lib/monthlyReport.ts app/api/keiri/monthly/route.ts
git commit -m "経理の月次: freeeと領収書から月次データを返すAPI"
```

---

### Task 6: ナビの切り離し

**Files:**
- Create: `components/KeiriNav.tsx`
- Modify: `components/Nav.tsx`（`GROUPS` から `keiri` を外す、「経理 →」リンク、経理ページで `KeiriNav` を返す）

**Interfaces:**
- Produces: `KEIRI_TABS: { href: string; label: string }[]`、`export default function KeiriNav({ path }: { path: string })`

- [ ] **Step 1: 経理用ナビを作る**

`components/KeiriNav.tsx`:

```tsx
"use client";

import Link from "next/link";

// 経理画面のナビ。店舗側のナビとは別に出す（components/Nav.tsx が出し分ける）。
export const KEIRI_TABS = [
  { href: "/keiri", label: "📅 月次" },
  { href: "/", label: "🧾 領収書" },
  { href: "/meisai", label: "🏦 明細" },
  { href: "/pending", label: "⏳ 処理待ち" },
  { href: "/kariire", label: "💴 立替" },
  { href: "/payables", label: "💰 払うもの" },
  { href: "/bills", label: "🔁 定期請求" },
  { href: "/loans", label: "🏦 借入返済" },
  { href: "/items", label: "🧺 品目台帳" },
  { href: "/report", label: "📊 用途別" },
  { href: "/shorui", label: "📄 書類" },
  { href: "/contracts", label: "📜 契約書" },
  { href: "/company", label: "🏢 会社書類" },
  { href: "/zeirishi", label: "🧑‍💼 税理士" },
];

export default function KeiriNav({ path }: { path: string }) {
  return (
    <nav className="knav">
      <div className="bar">
        <span className="title">経理</span>
        <Link href="/table" className="back">← 店舗へ</Link>
      </div>
      <div className="tabs">
        {KEIRI_TABS.map((t) => (
          <Link key={t.href} href={t.href} className={`tab ${path === t.href ? "active" : ""}`}>
            {t.label}
          </Link>
        ))}
      </div>
      <style jsx>{`
        .knav { margin-bottom: 14px; }
        .bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--ink, #2b2b2b);
          color: #fff;
          border-radius: 12px;
          padding: 10px 14px;
          margin-bottom: 10px;
        }
        .title { font-weight: 800; letter-spacing: 0.08em; }
        .bar :global(.back) { color: #fff; font-size: 13px; text-decoration: none; opacity: 0.85; }
        .bar :global(.back:hover) { opacity: 1; }
      `}</style>
    </nav>
  );
}
```

（`.tabs` と `.tab` / `.tab.active` は `app/globals.css` の既存スタイルをそのまま使う。店舗側のナビと同じ見た目のボタン列になる）

- [ ] **Step 2: Nav.tsx を書き換える**

`components/Nav.tsx` で次の4点を変える:

1. 先頭の import に足す:

```tsx
import KeiriNav, { KEIRI_TABS } from "@/components/KeiriNav";
```

2. `GROUPS` 配列から `key: "keiri"` のオブジェクト（`label: "経理"` と13個のタブ）をまるごと消す。

3. `export default function Nav()` の中身を、フックを先に全部呼んでから出し分ける形にする（フックの数を毎回同じにするため、`return` はフックの後）:

```tsx
export default function Nav() {
  const path = usePathname();
  const inKeiri = KEIRI_TABS.some((t) => t.href === path);
  // いま開いているページがある分野。無ければ最後に選んだ分野。
  const owner = GROUPS.find((g) => g.tabs.some((t) => t.href === path));
  const [group, setGroup] = useState<string>(owner?.key ?? "tenpo");

  useEffect(() => {
    if (owner) {
      setGroup(owner.key);
      try { localStorage.setItem(STORE_KEY, owner.key); } catch { /* 保存できなくても動く */ }
      return;
    }
    try {
      // 以前「経理」を選んで保存していた端末は、GROUPSに無いので店舗運営のまま
      const saved = localStorage.getItem(STORE_KEY);
      if (saved && GROUPS.some((g) => g.key === saved)) setGroup(saved);
    } catch { /* 保存できなくても動く */ }
  }, [owner]);

  if (inKeiri) return <KeiriNav path={path} />;

  const current = GROUPS.find((g) => g.key === group) ?? GROUPS[0];
```

（`return (` 以降の JSX は残す）

4. `.groups` の `<div>` の中、`GROUPS.map(...)` の後ろに「経理 →」リンクを足す:

```tsx
        <Link href="/keiri" className="keiri-link">経理 →</Link>
```

`<style jsx>` に足す（`Link` は styled-jsx のクラスが付かないので `:global` で書く）:

```css
        .groups :global(.keiri-link) {
          margin-left: auto;
          padding: 9px 14px;
          font-size: 14px;
          font-weight: 700;
          color: var(--accent, #a4622a);
          text-decoration: none;
          white-space: nowrap;
        }
        .groups :global(.keiri-link:hover) { text-decoration: underline; }
```

- [ ] **Step 3: ビルドが通ることを確かめる**

Run: `npm run build`
Expected: 成功（`/keiri` はまだ無いのでリンク先は 404 のまま。Task 7 で作る）

- [ ] **Step 4: コミット**

```bash
git add components/KeiriNav.tsx components/Nav.tsx
git commit -m "経理を店舗側のナビから切り離し、経理用のナビを出し分ける"
```

---

### Task 7: 月次ページ `/keiri`

> 実装のとき、CLAUDE.md の決まりどおり `impeccable` スキルを読んでから画面を仕上げる。ただし色・余白・カードは既存の `app/globals.css`（`--ink`, `--muted`, `--line`, `--accent`, `.card`）に合わせ、新しいデザインの仕組みは足さない。

**Files:**
- Create: `components/keiri/format.ts`
- Create: `components/keiri/ReceiptModal.tsx`
- Create: `components/keiri/CashTable.tsx`
- Create: `components/keiri/PlTable.tsx`
- Create: `components/keiri/KeiriMonthly.tsx`
- Create: `app/keiri/page.tsx`

**Interfaces:**
- Consumes: `KeiriMonthlyResponse`（Task 5、`import type` で route から）、`CashView`, `CashRow`, `PlView`, `PlLine`（`lib/keiri/types.ts`）、`Nav`
- Produces: ページ `/keiri?month=YYYY-MM&view=cash|pl`

- [ ] **Step 1: 表示用の小さな関数**

`components/keiri/format.ts`:

```ts
export const yen = (n: number) => `${n < 0 ? "−" : ""}¥${Math.abs(Math.round(n)).toLocaleString()}`;

/** 2026-10-05 → 10/05 */
export const md = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}`;

/** 2026-10 → 2026年10月 */
export const monthLabel = (m: string) => `${m.slice(0, 4)}年${Number(m.slice(5, 7))}月`;

export const TAG_LABEL = { card: "カード", bank: "銀行", cash: "現金", tatekae: "立替" } as const;
```

- [ ] **Step 2: 領収書画像のモーダル**

`components/keiri/ReceiptModal.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

// /api/receipts/image は { image: dataURL } を返す。PDFのこともあるので iframe で出し分ける。
export default function ReceiptModal({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/receipts/image?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.image) setImage(j.image);
        else setError(j.error || "画像がありません");
      })
      .catch(() => alive && setError("画像を読み込めませんでした"));
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={`領収書: ${title}`}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <b>{title}</b>
          <button type="button" onClick={onClose}>閉じる</button>
        </div>
        {error && <p className="hint">{error}</p>}
        {!error && !image && <p className="hint">読み込み中…</p>}
        {image && (image.startsWith("data:application/pdf")
          ? <iframe src={image} title={title} />
          : <img src={image} alt={`領収書: ${title}`} />)}
      </div>
      <style jsx>{`
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; }
        .sheet { background: var(--card, #fff); border-radius: 14px; padding: 14px; max-width: 560px; width: 100%; max-height: 90vh; overflow: auto; }
        .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; }
        img { width: 100%; height: auto; border-radius: 8px; }
        iframe { width: 100%; height: 70vh; border: 0; }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 3: 経理で見る**

`components/keiri/CashTable.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { CashRow, CashView } from "@/lib/keiri/types";
import ReceiptModal from "./ReceiptModal";
import { md, TAG_LABEL, yen } from "./format";

function ReceiptCell({ row, onOpen }: { row: CashRow; onOpen: (r: CashRow) => void }) {
  switch (row.receiptStatus) {
    case "attached":
      return <button type="button" className="rc ok" onClick={() => onOpen(row)}>🧾 領収書</button>;
    case "amazon":
      return (
        <a className="rc ok" target="_blank" rel="noreferrer"
          href={`https://www.amazon.co.jp/gp/your-account/order-details?orderID=${row.amazonOrderId}`}>
          📦 注文を見る
        </a>
      );
    case "missing-recorded":
      return <span className="rc warn">⚠ 領収書なし（記録済み）</span>;
    case "missing":
      return <span className="rc bad">⚠ 領収書なし</span>;
    default:
      return null;
  }
}

function Rows({ rows, out, onOpen }: { rows: CashRow[]; out: boolean; onOpen: (r: CashRow) => void }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (rows.length === 0) return <p className="hint">この月はありません。</p>;
  return (
    <ul className="rows">
      {rows.map((r) => (
        <li key={r.key} className={`${r.kind === "move" ? "move" : ""} ${r.processed ? "" : "todo"}`}>
          <button type="button" className="line" onClick={() => setOpenKey(openKey === r.key ? null : r.key)} aria-expanded={openKey === r.key}>
            <span className="date">{md(r.date)}</span>
            {out && r.tag && <span className={`tag ${r.tag}`}>{TAG_LABEL[r.tag]}</span>}
            <span className="title">{r.partner ?? r.title}</span>
            <span className="amt">{yen(r.amount)}</span>
          </button>
          <div className="sub">
            <span className="detail">{r.detail}{!r.processed && "（未処理）"}</span>
            {out && <ReceiptCell row={r} onOpen={onOpen} />}
          </div>
          {openKey === r.key && (
            <div className="more">
              <div>明細: {r.title}</div>
              {r.dealId && <div>freee 取引ID: {r.dealId}</div>}
              {r.journalId && <div>freee 振替伝票ID: {r.journalId}</div>}
              {r.walletTxnId && (
                <a target="_blank" rel="noreferrer" href={`https://secure.freee.co.jp/wallet_txns/stream/${r.walletTxnId}`}>
                  freeeで明細を開く
                </a>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function CashTable({ data }: { data: CashView }) {
  const [receipt, setReceipt] = useState<CashRow | null>(null);
  const t = data.totals;
  return (
    <>
      <section className="card kpis">
        <div><span className="cap">入金</span><b>{yen(t.in)}</b></div>
        <div><span className="cap">出金</span><b>{yen(t.out)}</b></div>
        <div><span className="cap">差引</span><b className={t.net >= 0 ? "g" : "r"}>{yen(t.net)}</b></div>
        <div><span className="cap">領収書なし</span><b className={t.missingReceipts ? "r" : ""}>{t.missingReceipts}件</b></div>
        <div><span className="cap">未処理</span><b className={t.unprocessed ? "r" : ""}>{t.unprocessed}件</b></div>
      </section>

      <section className="card">
        <h2>入ってきたお金</h2>
        <Rows rows={data.inflows} out={false} onOpen={setReceipt} />
      </section>

      <section className="card">
        <h2>出ていったお金</h2>
        <Rows rows={data.outflows} out onOpen={setReceipt} />
      </section>

      {receipt?.receipt && (
        <ReceiptModal id={receipt.receipt.id} title={receipt.receipt.vendor} onClose={() => setReceipt(null)} />
      )}

      <style jsx>{`
        .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 12px; }
        .kpis div { display: flex; flex-direction: column; gap: 2px; }
        .cap { font-size: 12px; color: var(--muted); }
        .kpis b { font-size: 18px; font-variant-numeric: tabular-nums; }
        .g { color: var(--ok, #2e7d32); }
        .r { color: #c62828; }
        h2 { font-size: 15px; margin: 0 0 10px; }
        :global(.rows) { list-style: none; margin: 0; padding: 0; }
        :global(.rows li) { border-top: 1px solid var(--line); padding: 8px 0; }
        :global(.rows li.move) { opacity: 0.55; }
        :global(.rows li.todo .title) { color: #c62828; }
        :global(.rows .line) { all: unset; cursor: pointer; display: flex; align-items: center; gap: 8px; width: 100%; }
        :global(.rows .date) { width: 44px; color: var(--muted); font-variant-numeric: tabular-nums; font-size: 13px; }
        :global(.rows .title) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        :global(.rows .amt) { font-variant-numeric: tabular-nums; font-weight: 700; }
        :global(.rows .tag) { font-size: 11px; padding: 2px 6px; border-radius: 6px; background: var(--accent-weak); color: var(--accent); white-space: nowrap; }
        :global(.rows .tag.bank) { background: #e8eef7; color: #2f5d9b; }
        :global(.rows .tag.cash) { background: #e8f3e9; color: #2e7d32; }
        :global(.rows .tag.tatekae) { background: #f6e8f3; color: #8e3a7d; }
        :global(.rows .sub) { display: flex; justify-content: space-between; gap: 8px; padding-left: 52px; font-size: 12px; color: var(--muted); }
        :global(.rows .detail) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        :global(.rows .rc) { white-space: nowrap; font-size: 12px; border: 0; background: none; padding: 0; cursor: pointer; text-decoration: none; }
        :global(.rows .rc.ok) { color: var(--accent); }
        :global(.rows .rc.warn) { color: #b26a00; cursor: default; }
        :global(.rows .rc.bad) { color: #c62828; cursor: default; }
        :global(.rows .more) { padding: 6px 0 0 52px; font-size: 12px; color: var(--muted); display: grid; gap: 2px; }
      `}</style>
    </>
  );
}
```

- [ ] **Step 4: 会計で見る**

`components/keiri/PlTable.tsx`:

```tsx
"use client";

import { Fragment, useState } from "react";
import type { PlLine, PlView } from "@/lib/keiri/types";
import { md, yen } from "./format";

function Accounts({ line }: { line: PlLine }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!line.accounts?.length) return <p className="hint">この月の動きはありません。</p>;
  return (
    <ul className="accts">
      {line.accounts.map((a) => (
        <li key={a.name}>
          <button type="button" className="acct" onClick={() => setOpen(open === a.name ? null : a.name)} aria-expanded={open === a.name}>
            <span>{a.entries.length ? (open === a.name ? "▾" : "▸") : "・"} {a.name}</span>
            <span className="amt">{yen(a.amount)}</span>
          </button>
          {open === a.name && (
            <ul className="entries">
              {a.entries.map((e, i) => (
                <li key={`${e.sourceType}${e.sourceId}-${i}`}>
                  <span className="date">{md(e.date)}</span>
                  <span className="desc">{e.description || "（摘要なし）"}</span>
                  <span className="amt">{yen(e.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function PlTable({ data }: { data: PlView }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="card">
      <table className="pl">
        <tbody>
          {data.lines.map((l) => (
            <Fragment key={l.key}>
              <tr className={l.kind}>
                <th>
                  {l.accounts ? (
                    <button type="button" className="toggle" onClick={() => setOpen(open === l.key ? null : l.key)} aria-expanded={open === l.key}>
                      {open === l.key ? "▾" : "▸"} {l.label}
                    </button>
                  ) : l.label}
                </th>
                <td className={l.kind !== "item" && l.amount < 0 ? "r" : ""}>{yen(l.amount)}</td>
              </tr>
              {l.key === "sga" && (
                <>
                  <tr className="part"><th>うち 役員報酬</th><td>{yen(data.officerPay)}</td></tr>
                  <tr className="part"><th>うち 人件費（給料手当・雑給・法定福利費）</th><td>{yen(data.laborCost)}</td></tr>
                </>
              )}
              {open === l.key && (
                <tr className="open"><td colSpan={2}><Accounts line={l} /></td></tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {data.tax.estimated && (
        <p className="hint">法人税等は見込みです（税引前利益がプラスなら×25%、毎月 均等割 ¥5,833）。決算で確定します。</p>
      )}
      <style jsx>{`
        .pl { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
        .pl th { text-align: left; font-weight: 500; padding: 8px 0; }
        .pl td { text-align: right; padding: 8px 0; white-space: nowrap; }
        .pl tr { border-top: 1px solid var(--line); }
        .pl tr.item th { padding-left: 16px; }
        .pl tr.subtotal th, .pl tr.subtotal td { font-weight: 700; }
        .pl tr.total th, .pl tr.total td { font-weight: 800; font-size: 17px; border-top: 2px solid var(--ink); }
        .pl tr.part th { padding-left: 36px; font-size: 13px; color: var(--muted); }
        .pl tr.part td { font-size: 13px; color: var(--muted); }
        .pl tr.open td { text-align: left; padding: 4px 0 10px 16px; }
        .r { color: #c62828; }
        .toggle { all: unset; cursor: pointer; }
        :global(.accts), :global(.entries) { list-style: none; margin: 0; padding: 0; }
        :global(.accts .acct) { all: unset; cursor: pointer; display: flex; justify-content: space-between; width: 100%; padding: 5px 0; font-size: 14px; }
        :global(.entries) { padding-left: 18px; }
        :global(.entries li) { display: flex; gap: 8px; font-size: 12px; color: var(--muted); padding: 3px 0; }
        :global(.entries .date) { width: 40px; }
        :global(.entries .desc) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      `}</style>
    </section>
  );
}
```

- [ ] **Step 5: 月の移動と切り替え**

`components/keiri/KeiriMonthly.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import type { KeiriMonthlyResponse } from "@/app/api/keiri/monthly/route";
import CashTable from "./CashTable";
import PlTable from "./PlTable";
import { monthLabel } from "./format";

export default function KeiriMonthly() {
  const router = useRouter();
  const sp = useSearchParams();
  const month = sp.get("month") ?? "";
  const view = sp.get("view") === "pl" ? "pl" : "cash";
  const [data, setData] = useState<KeiriMonthlyResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const go = useCallback(
    (m: string, v: string) => router.push(`/keiri?month=${m}&view=${v}`),
    [router],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
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

  const shown = data?.month ?? month;

  return (
    <main>
      <Nav />
      <div className="head">
        <div className="months">
          <button type="button" disabled={!data} onClick={() => data && go(data.prev, view)} aria-label="前の月">‹</button>
          <h1>{shown ? monthLabel(shown) : "　"}</h1>
          <button type="button" disabled={!data?.next} onClick={() => data?.next && go(data.next, view)} aria-label="次の月">›</button>
        </div>
        <div className="views" role="tablist">
          <button type="button" role="tab" aria-selected={view === "cash"} className={view === "cash" ? "on" : ""} onClick={() => go(shown, "cash")}>経理で見る</button>
          <button type="button" role="tab" aria-selected={view === "pl"} className={view === "pl" ? "on" : ""} onClick={() => go(shown, "pl")}>会計で見る</button>
        </div>
      </div>

      {error && (
        <section className="card">
          <p>{error}</p>
          {error.includes("未接続") && <a href="/api/freee/authorize">freeeに接続する</a>}
        </section>
      )}
      {loading && !error && <p className="hint">freeeから読み込んでいます…</p>}
      {!loading && data?.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
      {!loading && data?.future && <section className="card"><p>まだデータがありません。</p></section>}
      {!loading && data?.cash && view === "cash" && <CashTable data={data.cash} />}
      {!loading && data?.pl && view === "pl" && <PlTable data={data.pl} />}

      <style jsx>{`
        .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
        .months { display: flex; align-items: center; gap: 8px; }
        .months h1 { margin: 0; font-size: 22px; min-width: 140px; text-align: center; }
        .months button { width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); font-size: 18px; cursor: pointer; }
        .months button:disabled { opacity: 0.35; cursor: default; }
        .views { display: inline-flex; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
        .views button { border: 0; background: var(--card); padding: 8px 14px; font-weight: 700; color: var(--muted); cursor: pointer; }
        .views button.on { background: var(--ink); color: #fff; }
        .warn { background: #fff4e5; color: #8a5300; border-radius: 10px; padding: 8px 12px; font-size: 13px; }
      `}</style>
    </main>
  );
}
```

- [ ] **Step 6: ページ**

`app/keiri/page.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import KeiriMonthly from "@/components/keiri/KeiriMonthly";

// useSearchParams を使うので Suspense で包む（Next.js の決まり）
export default function KeiriPage() {
  return (
    <Suspense fallback={<main><p className="hint">読み込み中…</p></main>}>
      <KeiriMonthly />
    </Suspense>
  );
}
```

- [ ] **Step 7: ビルドが通ることを確かめる**

Run: `npm run build`
Expected: 成功。ルート一覧に `/keiri` が出る

- [ ] **Step 8: テストがまだ通ることを確かめる**

Run: `npm test`
Expected: PASS（全33件）

- [ ] **Step 9: コミット**

```bash
git add components/keiri app/keiri
git commit -m "経理の月次ページ: 経理で見る・会計で見るの切り替えと月の移動"
```

---

### Task 8: 本番での確認

**Files:** なし（確認だけ）

- [ ] **Step 1: 坂本さんに本番反映の許可をもらう**

CLAUDE.md の決まりで、`main` への反映は坂本さんが「mainに反映」と言ってから。言われたら:

```bash
git checkout main
git merge sync
git push origin main
git checkout sync
```

（`origin` の push 先は fork と origin の2本。fork への push で Vercel `flat-keihi` が本番デプロイする）

- [ ] **Step 2: 9月の会計で見るを開いて数字を照らし合わせる**

`https://flat-keihi.vercel.app/keiri?month=2026-09&view=pl` を開き、次と一致することを確かめる:

| 行 | 金額 |
|---|---|
| 売上高 | ¥713,513 |
| 売上総利益（粗利） | ¥456,775 |
| 販売費及び一般管理費 | ¥605,339 |
| うち 役員報酬 | ¥188,997 |
| 営業利益 | −¥148,564 |
| 経常利益 | −¥153,545 |
| 税引前当期純利益 | −¥153,545 |
| 法人税等（見込み） | ¥5,833 |
| 当期純利益（見込み） | −¥159,378 |

- [ ] **Step 3: 10月の経理で見るを開いて確かめる**

`https://flat-keihi.vercel.app/keiri?month=2026-10&view=cash` で:

- 10/9「スエヨシ」¥40,775 が出金に出て、詳細が「旅費交通費／航空券…」（8/24 計上の取引が拾えている）
- 10/12 ATM ¥9,000 が薄く「現金へ移動」で、出金の合計に入っていない
- 10/11 ドン・キホーテ ¥5,484 に「🧾 領収書」が付き、押すと画像が開く
- 10/1 Amazon ¥30,380 に「📦 注文を見る」
- 10/5 NETAGE ¥28,140 が「⚠ 領収書なし（記録済み）」
- 10/11 CAINZ ¥2,378 が「現金」タグで「🧾 領収書」

- [ ] **Step 4: ナビを確かめる**

- 店舗側のページ（例 `/table`）に「経理」グループが無く、右端に「経理 →」がある
- 「経理 →」で `/keiri` が開き、黒い帯の経理ナビが出る。「← 店舗へ」で戻れる
- 経理ナビの「🏦 明細」など既存ページを開いても経理ナビのまま
