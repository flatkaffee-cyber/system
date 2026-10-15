// 経理画面のナビに出すページ。components/KeiriNav.tsx と components/Nav.tsx が使う（JSXを含まないのでテストできる）。
import type { CashRow } from "./types";

export const KEIRI_TABS = [
  { href: "/keiri", label: "📅 月次" },
  { href: "/ryoshusho", label: "🧾 領収書" },
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

/** タブには並べないが、経理画面として経理ナビを出すページ */
const KEIRI_EXTRA_PATHS = ["/receipts"];

export function isKeiriPath(path: string): boolean {
  return KEIRI_TABS.some((t) => t.href === path) || KEIRI_EXTRA_PATHS.includes(path);
}

export function inflowLabel(kind: "sales" | "other" | "expense" | "move"): string {
  return kind === "sales" ? "売上金" : kind === "move" ? "移動" : "その他";
}

const FREEE = "https://secure.freee.co.jp";

/**
 * 行から開ける freee の画面。明細は自動で経理の明細画面。取引・振替伝票は個別の画面が無いので、
 * 仕訳帳を deal_id（取引ID・振替伝票IDのどちらでも効く）で絞り込んで開く。
 */
export function freeeLinks(row: Pick<CashRow, "walletTxnId" | "dealId" | "journalId">): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [];
  if (row.walletTxnId) links.push({ label: "freeeで明細を開く", href: `${FREEE}/wallet_txns/stream/${row.walletTxnId}` });
  if (row.dealId) links.push({ label: "freeeで取引を開く", href: `${FREEE}/reports/journals?deal_id=${row.dealId}` });
  if (row.journalId) links.push({ label: "freeeで振替伝票を開く", href: `${FREEE}/reports/journals?deal_id=${row.journalId}` });
  return links;
}
