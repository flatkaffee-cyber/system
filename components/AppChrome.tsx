"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_GROUPS, groupOf, pageLabel } from "@/lib/nav";

// 全ページ共通の外枠。PC（900px以上）は左にサイドバー、スマホは上に帯を固定し、☰ でメニューを開く。
// メニューは分野ごとに畳めて、いま開いているページの分野だけ最初から開いている。
// 店舗側は components/Nav.tsx、経理側は components/keiri/KeiriShell.tsx から使う。
//
// ページの中身をずらすのは body に付けるクラス（globals.css の body.has-ac）。
// 各ページの .wrap を書き換えずに済むようにするため。
//
// styled-jsx の注意：JSX を変数に入れるとスコープが付かないので、メニューは自分のスタイルを持つ部品にしてある。
// クラス名は全体CSS（globals.css の .tab など）と被らないよう ac- を付ける。

const OPEN_KEY = "nav:open";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ transform: `rotate(${open ? 90 : 0}deg)`, transition: "transform .18s cubic-bezier(.2,.8,.2,1)" }}>
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AppMenu({ path }: { path: string }) {
  const current = groupOf(path)?.key;
  const [open, setOpen] = useState<string[]>(current ? [current] : []);

  // 開いた分野は端末に覚えておく。いまのページの分野は必ず開く
  useEffect(() => {
    let saved: string[] = [];
    try { saved = JSON.parse(localStorage.getItem(OPEN_KEY) || "[]"); } catch { /* 読めなくても動く */ }
    setOpen([...new Set([...(Array.isArray(saved) ? saved : []), ...(current ? [current] : [])])]);
  }, [current]);

  const toggle = (key: string) => {
    const next = open.includes(key) ? open.filter((k) => k !== key) : [...open, key];
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* 保存できなくても動く */ }
  };

  return (
    <nav className="ac-menu" aria-label="メニュー">
      {NAV_GROUPS.map((g) => {
        const isOpen = open.includes(g.key);
        return (
          <div key={g.key} className={`ac-grp ${g.key === current ? "here" : ""}`}>
            <button type="button" className="ac-ghead" aria-expanded={isOpen} onClick={() => toggle(g.key)}>
              <span>{g.label}</span>
              <Chevron open={isOpen} />
            </button>
            {isOpen && (
              <div className="ac-items">
                {g.sections.map((s, i) => (
                  <div key={i} className="ac-sec">
                    {s.label && <div className="ac-slabel">{s.label}</div>}
                    {s.items.map((it) => (
                      <Link
                        key={it.href}
                        href={it.href}
                        className={`ac-item ${path === it.href ? "on" : ""}`}
                        aria-current={path === it.href ? "page" : undefined}
                      >
                        {it.label}
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <style jsx>{`
        .ac-menu { display: flex; flex-direction: column; gap: 2px; }
        .ac-grp { border-radius: 10px; }
        .ac-ghead {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 10px 10px;
          border: 0;
          border-radius: 10px;
          background: none;
          color: rgba(255, 255, 255, 0.78);
          font: inherit;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.02em;
          cursor: pointer;
          text-align: left;
        }
        .ac-ghead:hover { background: rgba(255, 255, 255, 0.07); color: #fff; }
        .ac-ghead:focus-visible { outline: 2px solid #f0c9a4; outline-offset: -2px; }
        .here .ac-ghead { color: #fff; }
        .ac-items { padding: 0 0 8px 8px; display: flex; flex-direction: column; gap: 6px; }
        .ac-sec { display: flex; flex-direction: column; gap: 1px; border-left: 1px solid rgba(255, 255, 255, 0.14); padding-left: 6px; }
        .ac-slabel { font-size: 11px; color: rgba(255, 255, 255, 0.5); padding: 4px 8px 2px; letter-spacing: 0.06em; }
        .ac-menu :global(.ac-item) {
          display: block;
          padding: 7px 10px;
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.72);
          text-decoration: none;
          font-size: 14px;
          line-height: 1.35;
        }
        .ac-menu :global(.ac-item:hover) { background: rgba(255, 255, 255, 0.08); color: #fff; }
        .ac-menu :global(.ac-item.on) { background: #b5651d; color: #fff; font-weight: 700; }
        .ac-menu :global(.ac-item:focus-visible) { outline: 2px solid #f0c9a4; outline-offset: -2px; }
      `}</style>
    </nav>
  );
}

export default function AppChrome() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const group = groupOf(path);
  const label = pageLabel(path);

  // ページを移ったらスマホのメニューを閉じる
  useEffect(() => setOpen(false), [path]);

  // ページの中身をサイドバー・上の帯の分だけずらす
  useEffect(() => {
    document.body.classList.add("has-ac");
    return () => document.body.classList.remove("has-ac");
  }, []);

  // メニューを開いている間は後ろをスクロールさせない
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <aside className="ac-side">
        <Link href="/opening" className="ac-brand">flat.</Link>
        <AppMenu path={path} />
      </aside>

      <header className="ac-top">
        <button
          type="button"
          className="ac-burger"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="ac-drawer"
          aria-label={open ? "メニューを閉じる" : "メニューを開く"}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            {open ? (
              <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
        <Link href="/opening" className="ac-brand">flat.</Link>
        <span className="ac-where">
          {group && <span className="ac-wg">{group.label}</span>}
          {label && <span className="ac-wp">{label}</span>}
        </span>
      </header>

      {open && (
        <>
          <button type="button" className="ac-scrim" aria-label="メニューを閉じる" onClick={() => setOpen(false)} />
          <div className="ac-drawer" id="ac-drawer">
            <AppMenu path={path} />
          </div>
        </>
      )}

      <style jsx>{`
        .ac-side { display: none; }
        .ac-top {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 52px;
          z-index: 40; /* 経理のページのビューア（50）より下。メニュー・暗幕は上 */
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 10px;
          padding-top: env(safe-area-inset-top);
          box-sizing: content-box;
          background: var(--ink);
          color: #fff;
        }
        .ac-burger {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          cursor: pointer;
          flex-shrink: 0;
        }
        .ac-burger:focus-visible { outline: 2px solid #f0c9a4; outline-offset: 2px; }
        .ac-top :global(.ac-brand), .ac-side :global(.ac-brand) {
          color: #fff;
          text-decoration: none;
          font-weight: 800;
          font-size: 18px;
          letter-spacing: 0.02em;
        }
        .ac-where { display: flex; align-items: baseline; gap: 8px; min-width: 0; overflow: hidden; }
        .ac-wg { font-size: 12px; color: rgba(255, 255, 255, 0.6); white-space: nowrap; }
        .ac-wp { font-size: 14.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ac-scrim {
          position: fixed;
          inset: 0;
          z-index: 940;
          border: 0;
          padding: 0;
          background: rgba(20, 18, 15, 0.42);
        }
        .ac-drawer {
          position: fixed;
          top: calc(52px + env(safe-area-inset-top));
          left: 0;
          bottom: 0;
          width: min(320px, 86vw);
          overflow-y: auto;
          overscroll-behavior: contain;
          z-index: 950;
          background: var(--ink);
          padding: 10px 10px 32px;
          box-shadow: 8px 0 24px rgba(0, 0, 0, 0.18);
          animation: ac-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        @keyframes ac-in { from { transform: translateX(-24px); opacity: 0.4; } to { transform: none; opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .ac-drawer { animation: none; } }

        @media (min-width: 900px) {
          .ac-side {
            display: block;
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: 232px;
            overflow-y: auto;
            overscroll-behavior: contain;
            background: var(--ink);
            color: #fff;
            padding: 20px 12px 32px;
            z-index: 40;
            scrollbar-width: thin;
            scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
          }
          .ac-side :global(.ac-brand) { display: block; font-size: 22px; padding: 0 10px 18px; }
          .ac-top, .ac-drawer, .ac-scrim { display: none; }
        }
        @media print {
          .ac-side, .ac-top, .ac-drawer, .ac-scrim { display: none; }
        }
      `}</style>
    </>
  );
}
