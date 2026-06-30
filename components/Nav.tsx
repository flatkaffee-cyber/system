"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const path = usePathname();
  const tabs = [
    { href: "/", label: "🧾 領収書" },
    { href: "/meisai", label: "🏦 明細" },
    { href: "/payables", label: "💰 払うもの" },
    { href: "/soudan", label: "💬 相談" },
  ];
  return (
    <nav className="tabs">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`tab ${path === t.href ? "active" : ""}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
