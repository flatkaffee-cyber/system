"use client";

// 売上計画のタブ（数字 → 売上計画）。月を選んで、その月の計画と実績を見る。PDFは印刷のページから
import { useRef, useState } from "react";
import CopyRich from "@/components/CopyRich";
import Link from "next/link";
import Nav from "@/components/Nav";
import SalesPlan, { useSeiseki } from "@/components/SalesPlan";

const thisMonth = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);
const shift = (m: string, n: number) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

export default function Keikaku() {
  const [month, setMonth] = useState(thisMonth());
  const { data, err } = useSeiseki(month);
  const planRef = useRef<HTMLDivElement>(null);
  return (
    <div className="wrap" style={{ maxWidth: 960 }}>
      <header>
        <h1>🗓 売上計画</h1>
        <p>月の目標と日ごとの目標、いまの実績</p>
      </header>
      <Nav />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <button className="ghost" onClick={() => setMonth(shift(month, -1))}>◀ 前の月</button>
        <strong style={{ fontSize: 15 }}>{Number(month.slice(0, 4))}年{Number(month.slice(5))}月</strong>
        <button className="ghost" onClick={() => setMonth(shift(month, 1))}>次の月 ▶</button>
        <span style={{ flex: 1 }} />
        {data && <CopyRich target={planRef} label="📋 コピー（Docsに貼る）" />}
        <Link
          href={`/keikaku/print?month=${month}`}
          target="_blank"
          style={{ padding: "9px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none" }}
        >
          📄 PDFで出力
        </Link>
      </div>
      {err && <p className="err">{err}</p>}
      {!data && !err && <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>読み込み中…</div>}
      {data && (
        <div className="card">
          <div ref={planRef}>
            <SalesPlan data={data} />
          </div>
        </div>
      )}
      <p className="hint">日ごとの目標を変えたいときは、チャットで「11月の目標を変えたい」と相談してください。</p>
    </div>
  );
}
