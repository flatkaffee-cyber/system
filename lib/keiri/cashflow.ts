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
