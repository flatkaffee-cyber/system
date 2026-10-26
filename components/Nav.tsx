"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AppChrome from "@/components/AppChrome";
import { groupItems, groupOf } from "@/lib/nav";

// 店舗側のページの見出しの下に置くナビ。
// 外枠（PCのサイドバー・スマホの上の帯）は AppChrome が出す。
// スマホでは、いまのページと同じ分野の画面だけを横に並べる（全部の画面を並べると多すぎて探せないため）。
// 分野をまたぐときは上の帯の ☰ から。
export default function Nav() {
  const path = usePathname();
  const group = groupOf(path);
  const items = group ? groupItems(group) : [];

  return (
    <>
      <AppChrome />
      {items.length > 1 && (
        <nav className="nv-strip" aria-label={`${group!.label}の画面`}>
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={`nv-chip ${path === it.href ? "on" : ""}`}
              aria-current={path === it.href ? "page" : undefined}
            >
              {it.label}
            </Link>
          ))}
        </nav>
      )}
      <style jsx>{`
        .nv-strip {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          scrollbar-width: none;
          margin: 0 -16px 14px;
          padding: 2px 16px 4px;
        }
        .nv-strip::-webkit-scrollbar { display: none; }
        .nv-strip :global(.nv-chip) {
          flex-shrink: 0;
          padding: 7px 13px;
          border-radius: 999px;
          border: 1px solid var(--line);
          background: var(--card);
          color: var(--ink);
          font-size: 13.5px;
          text-decoration: none;
          white-space: nowrap;
        }
        .nv-strip :global(.nv-chip.on) { background: var(--ink); border-color: var(--ink); color: #fff; font-weight: 700; }
        .nv-strip :global(.nv-chip:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
        @media (min-width: 900px) {
          .nv-strip { display: none; }
        }
      `}</style>
    </>
  );
}
