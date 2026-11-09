"use client";

// レポートの一覧（数字 → レポート）。MTG用にまとめたレポートを、システムの中から開けるようにする。
// レポートの本体は public/reports/ の HTML（合言葉で守られている。middleware の PUBLIC_FILES に入れないこと）
import Nav from "@/components/Nav";

const REPORTS: { href: string; title: string; note: string; date: string }[] = [
  {
    href: "/reports/2026-11_uregoto.html",
    title: "商品の売れ行き（8月〜11月）",
    note: "11月の全体MTG用。伸びている・落ちている商品、ワッフルのフレーバー、MTGで決めたいこと",
    date: "2026-11-09",
  },
];

export default function Reports() {
  return (
    <div className="wrap">
      <header>
        <h1>📑 レポート</h1>
        <p>MTG用にまとめたレポート</p>
      </header>
      <Nav />
      {REPORTS.map((r) => (
        <a
          key={r.href}
          href={r.href}
          className="card"
          style={{ display: "block", textDecoration: "none", color: "var(--ink)", padding: "14px 16px" }}
        >
          <div style={{ fontWeight: 700, fontSize: 15 }}>{r.title}</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{r.note}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{r.date.replace(/-/g, "/")} 作成</div>
        </a>
      ))}
      <p className="hint">月次レポート（帳簿の数字）は「月次レポート」、商品ごとの数字は「分析」の「表」「グラフ」で見られます。</p>
    </div>
  );
}
