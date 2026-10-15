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
          z-index: 40; /* 経理のページのビューア（50）より下。メニュー・暗幕・行のメニューは上 */
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
            z-index: 40; /* 経理のページのビューア（50）より下。メニュー・暗幕・行のメニューは上 */
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
