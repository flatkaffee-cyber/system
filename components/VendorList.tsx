"use client";

import { useEffect, useState, Fragment } from "react";

// 仕入れ先ごとの一覧。「仕入れ」ページのタブの一つ。
// 領収書から、店ごとに「合計いくら・何回・最後にいつ」と、そこで買っている品目を出す。

type Item = { name: string; count: number; lastDate: string; lastAmount: number; totalAmount: number };
type Vendor = {
  vendor: string; visits: number; totalAmount: number;
  firstDate: string; lastDate: string; daysSinceLast: number; items: Item[];
};

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const md = (d: string) => d.slice(5).replace("-", "/");
const td = { padding: "6px 8px", borderBottom: "1px solid var(--line)", borderRight: "1px solid var(--line)", whiteSpace: "nowrap" as const };
const th = { ...td, background: "#f3efe8", borderBottom: "2px solid var(--line)", textAlign: "left" as const };

export default function VendorList() {
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/shiire?view=vendors")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "取得失敗");
        setVendors(d.vendors || []);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "取得失敗"));
  }, []);

  if (err) return <p className="err">{err}</p>;
  if (!vendors) return <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>集計中…</div>;

  const query = q.trim().toLowerCase();
  const list = vendors.filter(
    (v) => !query || v.vendor.toLowerCase().includes(query) || v.items.some((i) => i.name.toLowerCase().includes(query)),
  );

  return (
    <div className="card" style={{ padding: 10 }}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="店名・品目で絞り込む（例：業務スーパー、牛乳）"
        style={{ width: "100%", boxSizing: "border-box", marginBottom: 8 }}
      />
      <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 6 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%", minWidth: 560 }}>
          <thead>
            <tr>
              <th style={th}>仕入れ先</th>
              <th style={{ ...th, textAlign: "right" }}>合計</th>
              <th style={{ ...th, textAlign: "right" }}>回数</th>
              <th style={{ ...th, textAlign: "right" }}>最後に買った日</th>
              <th style={{ ...th, textAlign: "right" }}>品目</th>
            </tr>
          </thead>
          <tbody>
            {list.map((v, i) => {
              const isOpen = open === v.vendor;
              const bg = i % 2 ? "#faf8f4" : "#fff";
              return (
                <Fragment key={v.vendor}>
                  <tr onClick={() => setOpen(isOpen ? null : v.vendor)} style={{ background: bg, cursor: "pointer" }}>
                    <td style={{ ...td, fontWeight: 700, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {isOpen ? "▾" : "▸"} {v.vendor}
                    </td>
                    <td style={{ ...td, textAlign: "right" }} className="mono">{yen(v.totalAmount)}</td>
                    <td style={{ ...td, textAlign: "right" }} className="mono">{v.visits}回</td>
                    <td style={{ ...td, textAlign: "right" }} className="mono">
                      {md(v.lastDate)}<span style={{ color: "var(--muted)" }}>（{v.daysSinceLast}日前）</span>
                    </td>
                    <td style={{ ...td, textAlign: "right" }} className="mono">{v.items.length}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={5} style={{ padding: "6px 6px 10px 22px", background: bg, borderBottom: "1px solid var(--line)" }}>
                        <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
                          <thead>
                            <tr>
                              <th style={th}>品目</th>
                              <th style={{ ...th, textAlign: "right" }}>前回の金額</th>
                              <th style={{ ...th, textAlign: "right" }}>前回買った日</th>
                              <th style={{ ...th, textAlign: "right" }}>回数</th>
                              <th style={{ ...th, textAlign: "right" }}>累計</th>
                            </tr>
                          </thead>
                          <tbody>
                            {v.items.map((it) => (
                              <tr key={it.name} style={{ background: "#fff" }}>
                                <td style={{ ...td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</td>
                                <td style={{ ...td, textAlign: "right" }} className="mono">{yen(it.lastAmount)}</td>
                                <td style={{ ...td, textAlign: "right" }} className="mono">{md(it.lastDate)}</td>
                                <td style={{ ...td, textAlign: "right" }} className="mono">{it.count}</td>
                                <td style={{ ...td, textAlign: "right" }} className="mono">{yen(it.totalAmount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
                          初めて買った日 {v.firstDate}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ margin: "6px 0 0" }}>
        領収書から集計（{list.length}店）。合計は領収書の金額（送料・値引き込み）。店名を押すと、その店で買っている品目が出ます。
      </p>
    </div>
  );
}
