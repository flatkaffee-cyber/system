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
