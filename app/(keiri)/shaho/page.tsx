"use client";

import { useState } from "react";
import { NOTICES, SHAHO_OFFICE, totalOf } from "@/lib/shaho";

// 社会保険料の納付。年金事務所の納入告知書の中身（何月分・いくら・期限・Pay-easy の番号）を月ごとに出す。
// データは lib/shaho.ts。告知書が届いたらそこに足す。

const fmt = (n: number) => `¥${n.toLocaleString()}`;
const todayJST = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export default function Shaho() {
  const [copied, setCopied] = useState("");
  const today = todayJST();
  const list = [...NOTICES].sort((a, b) => b.month.localeCompare(a.month));

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch { /* コピーできない環境では何もしない */ }
  };

  const Copyable = ({ k, label, value }: { k: string; label: string; value: string }) => (
    <div className="result-row" onClick={() => copy(k, value)} style={{ cursor: "pointer" }}>
      <span>{label}</span>
      <span className="mono">
        {value}{" "}
        <span style={{ fontSize: 11, color: copied === k ? "var(--ok)" : "var(--muted)" }}>
          {copied === k ? "コピーしました" : "コピー"}
        </span>
      </span>
    </div>
  );

  return (
    <div>
      <header>
        <h1>🏥 社会保険</h1>
        <p>健康保険・厚生年金・子ども子育て拠出金。前月分を毎月末までに納める（会社負担と本人負担の合計）</p>
      </header>

      <div className="card">
        <div className="cat-title">事業所</div>
        <div className="result-row"><span>管轄</span><span>{SHAHO_OFFICE.office}</span></div>
        <div className="result-row"><span>事業所整理記号</span><span className="mono">{SHAHO_OFFICE.seiriKigou}</span></div>
        <div className="result-row"><span>事業所番号</span><span className="mono">{SHAHO_OFFICE.officeNumber}</span></div>
      </div>

      {list.map((n) => {
        const late = !n.paidOn && n.due < today;
        return (
          <div key={n.month} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <div className="cat-title" style={{ margin: 0 }}>{Number(n.month.slice(5))}月分</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: n.paidOn ? "var(--ok)" : late ? "#c0392b" : "#b5651d" }}>
                {n.paidOn ? `${md(n.paidOn)} 納付済み` : late ? `期限（${md(n.due)}）を過ぎています` : `期限 ${md(n.due)}`}
              </div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, margin: "6px 0" }} className="mono">{fmt(totalOf(n))}</div>
            <div className="result-row"><span>健康保険料</span><span className="mono">{fmt(n.health)}</span></div>
            <div className="result-row"><span>厚生年金保険料</span><span className="mono">{fmt(n.pension)}</span></div>
            <div className="result-row"><span>子ども・子育て拠出金</span><span className="mono">{fmt(n.child)}</span></div>

            <div className="cat-title" style={{ marginTop: 12 }}>Pay-easy で払う</div>
            <Copyable k={n.month + "biller"} label="収納機関番号" value={SHAHO_OFFICE.payeasyBiller} />
            <Copyable k={n.month + "pay"} label="納付番号" value={n.payNumber} />
            <Copyable k={n.month + "confirm"} label="確認番号" value={n.confirmNumber} />
            {n.note && <p className="hint" style={{ marginTop: 8 }}>{n.note}</p>}
          </div>
        );
      })}

      <p className="hint" style={{ textAlign: "center" }}>
        GMOあおぞらネット銀行の「税金・各種料金の払込み（Pay-easy）」で、上の3つの番号を入れると払えます。
        新しい告知書が届いたら、写真かPDFを渡してください（ここに足します）。
      </p>
    </div>
  );
}
