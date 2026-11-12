"use client";

// スタンプカードの一覧（お店の人用）。誰が何個集めているか、使っていないチケットが何枚あるか。
// お客さんのカードは LINE の中（/e/stamp）。スタンプは注文画面の「🎟 スタンプカード」からQRを出して付ける。
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import StampIssue from "@/components/StampIssue";

type Row = { id: string; name: string; stamps: number; totalStamps: number; completed: number; tickets: number; createdAt: string; lastAt: string | null };
const md = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

export default function StampAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  // 消す前にもう一度押してもらう（ダイアログは使わない）
  const [delId, setDelId] = useState<string | null>(null);
  const remove = async (id: string) => {
    setErr("");
    try {
      const r = await fetch("/api/stamp", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "消せませんでした");
      setRows((cur) => (cur ?? []).filter((x) => x.id !== id));
      setDelId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "消せませんでした");
    }
  };
  useEffect(() => {
    fetch("/api/stamp")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "読めませんでした");
        setRows(d.cards);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "読めませんでした"));
  }, []);
  const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid var(--line)", textAlign: "right", whiteSpace: "nowrap" };
  return (
    <div className="wrap">
      <header>
        <h1>🎟 スタンプカード</h1>
        <p>お会計 ¥600 ごとに1つ、ランニングの日は+1。10個でドリンク1杯、30個でTシャツかドリンク5枚</p>
      </header>
      <Nav />
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <StampIssue />
        <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7 }}>
          お会計のあとに押して、出たQRをお客さんにLINEかスマホのカメラで読んでもらいます。注文画面の上と、会計完了の画面にも同じボタンがあります。
        </div>
      </div>
      {err && <p className="err">{err}</p>}
      {!rows && !err && <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>読み込み中…</div>}
      {rows && (
        <div className="card" style={{ overflowX: "auto" }}>
          <div className="cat-title">カードを持っている人（{rows.length}人）</div>
          {rows.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>まだいません。最初のQRを読んだ人から並びます。</div>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr style={{ color: "var(--muted)", fontSize: 12 }}>
                  <th style={{ ...cell, textAlign: "left" }}>名前（LINE）</th>
                  <th style={cell}>いまのカード</th>
                  <th style={cell}>合計</th>
                  <th style={cell}>集めた枚数</th>
                  <th style={cell}>未使用チケット</th>
                  <th style={cell}>最後に来た日</th>
                  <th style={cell} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ ...cell, textAlign: "left", fontWeight: 700 }}>{r.name}</td>
                    <td style={cell}>{r.stamps} / 30</td>
                    <td style={cell}>{r.totalStamps}</td>
                    <td style={cell}>{r.completed}</td>
                    <td style={cell}>{r.tickets}</td>
                    <td style={cell}>{md(r.lastAt ?? r.createdAt)}</td>
                    <td style={cell}>
                      {delId === r.id ? (
                        <span style={{ display: "inline-flex", gap: 6 }}>
                          <button onClick={() => remove(r.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#b23a2c", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>消す</button>
                          <button onClick={() => setDelId(null)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--line)", background: "#fff", fontSize: 12, cursor: "pointer" }}>やめる</button>
                        </span>
                      ) : (
                        <button onClick={() => setDelId(r.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--line)", background: "#fff", color: "var(--muted)", fontSize: 12, cursor: "pointer" }}>カードを消す</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
