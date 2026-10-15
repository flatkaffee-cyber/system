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
