"use client";

import Link from "next/link";

// 経理画面のナビ。店舗側のナビとは別に出す（components/Nav.tsx が出し分ける）。
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
