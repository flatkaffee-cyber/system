"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

// 画面が増えて一覧から探せなくなったので、分野で分ける。
// いま開いているページが属する分野を最初に開き、
// タブを押せば他の分野に移れる。選んだ分野は次に来たときも覚えている。

type Group = { key: string; label: string; tabs: { href: string; label: string }[] };

const GROUPS: Group[] = [
  {
    key: "tenpo",
    label: "店舗運営",
    tabs: [
      { href: "/table", label: "🛎️ 注文" },
      { href: "/kitchen", label: "🍳 KDS" },
      { href: "/opening", label: "✅ 業務チェック" },
      { href: "/shift", label: "🗓️ シフト" },
      { href: "/shift-build", label: "🧩 シフトを組む" },
      { href: "/shift-submit", label: "📝 シフト提出" },
      { href: "/kintai", label: "⏰ 勤怠" },
      { href: "/labor", label: "🕒 労働枠" },
      { href: "/schedule", label: "🗓️ 店舗予定" },
      { href: "/shikomi", label: "📆 週間予定" },
      { href: "/menu", label: "🍽️ メニュー" },
      { href: "/menu-admin", label: "✏️ メニュー編集" },
      { href: "/buppan", label: "👕 物販登録" },
      { href: "/food", label: "🍳 レシピ" },
      { href: "/purchase", label: "📋 発注リスト" },
      { href: "/orders", label: "📬 購入メール" },
      { href: "/shiire", label: "🛒 仕入れ" },
      { href: "/stockroom", label: "📦 ストック確認" },
      { href: "/meetings", label: "🗣 MTG" },
      { href: "/todos", label: "✅ ToDo" },
    ],
  },
  {
    key: "keiei",
    label: "数字を見る",
    tabs: [
      { href: "/seiseki", label: "🏅 今月の成績" },
      { href: "/monthly", label: "🗓 月次レポート" },
      { href: "/sales", label: "📈 売上" },
      { href: "/bunseki", label: "🔍 分析" },
      { href: "/accounting", label: "📊 経営" },
    ],
  },
  {
    key: "event",
    label: "イベント",
    tabs: [
      { href: "/shutten/reji", label: "🧮 出店レジ" },
      { href: "/shutten", label: "🎪 出店準備" },
      { href: "/event/kanri", label: "🎧 イベント申込" },
      { href: "/natsumatsuri/kanri", label: "🎆 夏祭り申込" },
    ],
  },
  {
    key: "sonota",
    label: "その他",
    tabs: [
      { href: "/soudan", label: "💬 相談" },
      { href: "/knowledge", label: "📚 ナレッジ" },
      { href: "/meishi", label: "🪪 名刺" },
      { href: "/supporters", label: "☕ 支援者チケット" },
      { href: "/help", label: "❓ 使い方" },
    ],
  },
];

const STORE_KEY = "nav:group";

export default function Nav() {
  const path = usePathname();
  // いま開いているページがある分野。無ければ最後に選んだ分野。
  const owner = GROUPS.find((g) => g.tabs.some((t) => t.href === path));
  const [group, setGroup] = useState<string>(owner?.key ?? "tenpo");

  useEffect(() => {
    if (owner) {
      setGroup(owner.key);
      try { localStorage.setItem(STORE_KEY, owner.key); } catch { /* 保存できなくても動く */ }
      return;
    }
    try {
      // 以前「経理」を選んで保存していた端末は、GROUPSに無いので店舗運営のまま
      const saved = localStorage.getItem(STORE_KEY);
      if (saved && GROUPS.some((g) => g.key === saved)) setGroup(saved);
    } catch { /* 保存できなくても動く */ }
  }, [owner]);

  const current = GROUPS.find((g) => g.key === group) ?? GROUPS[0];

  return (
    <nav className="nav">
      <div className="groups">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => {
              setGroup(g.key);
              try { localStorage.setItem(STORE_KEY, g.key); } catch { /* 保存できなくても動く */ }
            }}
            className={`group ${g.key === group ? "on" : ""}`}
          >
            {g.label}
          </button>
        ))}
        <Link href="/keiri" className="keiri-link">業務管理 →</Link>
      </div>
      <div className="tabs">
        {current.tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`tab ${path === t.href ? "active" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <style jsx>{`
        .nav { margin-bottom: 14px; }
        .groups {
          display: flex;
          gap: 4px;
          border-bottom: 2px solid var(--line, #e5e2dc);
          margin-bottom: 10px;
          overflow-x: auto;
        }
        .group {
          border: 0;
          background: none;
          padding: 9px 14px;
          font-size: 14px;
          font-weight: 700;
          color: var(--muted, #8a8580);
          cursor: pointer;
          white-space: nowrap;
          border-bottom: 3px solid transparent;
          margin-bottom: -2px;
          border-radius: 0;
        }
        .group:hover { color: var(--fg, #3a3532); }
        .group.on {
          color: var(--accent, #a4622a);
          border-bottom-color: var(--accent, #a4622a);
        }
        .groups :global(.keiri-link) {
          margin-left: auto;
          padding: 9px 14px;
          font-size: 14px;
          font-weight: 700;
          color: var(--accent, #a4622a);
          text-decoration: none;
          white-space: nowrap;
        }
        .groups :global(.keiri-link:hover) { text-decoration: underline; }
        .group:focus-visible {
          outline: 2px solid var(--accent, #a4622a);
          outline-offset: -2px;
        }
      `}</style>
    </nav>
  );
}
