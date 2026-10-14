// 経理画面のナビに出すページ。components/KeiriNav.tsx と components/Nav.tsx が使う（JSXを含まないのでテストできる）。
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
