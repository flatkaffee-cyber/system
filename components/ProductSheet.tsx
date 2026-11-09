"use client";

// 分析の「表」。エクセルのように、商品をカテゴリーごとに並べ、横に月ごとの数・売上・原価を出す。
// 上にカテゴリーのランキング、カテゴリーの中は売れている順に順位を付ける。
// 2026-11-09 坂本さん「エクセル形式で、カテゴリー別にずらっと並べて、横に毎月の数・売上・原価を見たい」

import { Fragment, useMemo, useState } from "react";

export type SheetProduct = {
  name: string;
  qty: number;
  amount: number;
  cost: number;
  hasCost: boolean;
  noCost: boolean;
  category: string;
  months: { month: string; qty: number; amount: number; cost?: number }[];
};

type Col = "qty" | "amount" | "cost";
const COL_LABEL: Record<Col, string> = { qty: "数", amount: "売上", cost: "原価" };

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const num = (n: number) => Math.round(n).toLocaleString();
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : "—");
const nameOf = (n: string) => (n === "不明" ? "金額だけの注文" : n);

export default function ProductSheet({ products }: { products: SheetProduct[] }) {
  const [cols, setCols] = useState<Col[]>(["qty", "amount", "cost"]);
  const [rankBy, setRankBy] = useState<"amount" | "qty">("amount");
  const [hideZero, setHideZero] = useState(false);

  const months = useMemo(
    () => [...new Set(products.flatMap((p) => p.months.map((m) => m.month)))].sort(),
    [products],
  );

  // カテゴリーごとにまとめ、売上（または数）の多い順に並べる
  const groups = useMemo(() => {
    const by = new Map<string, SheetProduct[]>();
    for (const p of products) {
      if (hideZero && p.qty === 0) continue;
      const c = p.category || "その他";
      by.set(c, [...(by.get(c) ?? []), p]);
    }
    return [...by.entries()]
      .map(([category, list]) => {
        const sorted = [...list].sort((a, b) => b[rankBy] - a[rankBy] || b.amount - a.amount);
        const total = { qty: 0, amount: 0, cost: 0 };
        const byMonth: Record<string, { qty: number; amount: number; cost: number }> = {};
        for (const p of list) {
          total.qty += p.qty;
          total.amount += p.amount;
          total.cost += p.cost;
          for (const m of p.months) {
            const t = (byMonth[m.month] = byMonth[m.month] ?? { qty: 0, amount: 0, cost: 0 });
            t.qty += m.qty;
            t.amount += m.amount;
            t.cost += m.cost ?? 0;
          }
        }
        return { category, list: sorted, total, byMonth };
      })
      .sort((a, b) => b.total[rankBy] - a.total[rankBy]);
  }, [products, rankBy, hideZero]);

  const grand = groups.reduce((s, g) => s + g.total.amount, 0);
  const fmt = (c: Col, v: number) => (c === "qty" ? num(v) : v === 0 && c === "cost" ? "—" : yen(v));
  const toggleCol = (c: Col) =>
    setCols((cur) => (cur.includes(c) ? (cur.length > 1 ? cur.filter((x) => x !== c) : cur) : (["qty", "amount", "cost"] as Col[]).filter((x) => cur.includes(x) || x === c)));

  const cell: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid var(--line)", textAlign: "right", whiteSpace: "nowrap" };
  const sticky: React.CSSProperties = { position: "sticky", left: 0, zIndex: 1, textAlign: "left", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" };
  const monthEdge = (i: number): React.CSSProperties => (i === 0 ? { borderLeft: "2px solid var(--line)" } : {});
  const chip = (on: boolean): React.CSSProperties => ({
    padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
    border: on ? "2px solid var(--accent)" : "1px solid var(--line)",
    background: on ? "var(--accent-weak)" : "var(--card)", color: "var(--ink)",
  });

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* カテゴリーのランキング */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>カテゴリーのランキング</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums", minWidth: 560, width: "100%" }}>
            <thead>
              <tr style={{ color: "var(--muted)", fontSize: 12 }}>
                <th style={{ ...cell, textAlign: "left", width: 40 }}>順位</th>
                <th style={{ ...cell, textAlign: "left" }}>カテゴリー</th>
                <th style={cell}>売上</th>
                <th style={cell}>売上の割合</th>
                <th style={cell}>数</th>
                <th style={cell}>原価率</th>
                <th style={{ ...cell, textAlign: "left" }}>いちばん売れている商品</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, i) => (
                <tr key={g.category}>
                  <td style={{ ...cell, textAlign: "left", fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ ...cell, textAlign: "left", fontWeight: 700 }}>{g.category}</td>
                  <td style={cell}>{yen(g.total.amount)}</td>
                  <td style={cell}>{pct(g.total.amount, grand)}</td>
                  <td style={cell}>{num(g.total.qty)}</td>
                  <td style={cell}>{g.total.cost > 0 ? pct(g.total.cost, g.total.amount) : "—"}</td>
                  <td style={{ ...cell, textAlign: "left" }}>{g.list[0] ? nameOf(g.list[0].name) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 切り替え */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>月ごとに出す</span>
        {(["qty", "amount", "cost"] as Col[]).map((c) => (
          <button key={c} style={chip(cols.includes(c))} onClick={() => toggleCol(c)}>{COL_LABEL[c]}</button>
        ))}
        <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>並べる順</span>
        <button style={chip(rankBy === "amount")} onClick={() => setRankBy("amount")}>売上</button>
        <button style={chip(rankBy === "qty")} onClick={() => setRankBy("qty")}>数</button>
        <button style={chip(hideZero)} onClick={() => setHideZero(!hideZero)}>0個の商品を隠す</button>
      </div>

      {/* 商品の表 */}
      <div style={{ overflow: "auto", maxHeight: "75vh", border: "1px solid var(--line)", borderRadius: 8 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 12.5, fontVariantNumeric: "tabular-nums", width: "100%" }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...cell, ...sticky, zIndex: 3, top: 0, background: "var(--card)", position: "sticky" }}>商品</th>
              {[...months, "合計"].map((m, i) => (
                <th
                  key={m}
                  colSpan={cols.length + (m === "合計" ? 1 : 0)}
                  style={{ ...cell, ...monthEdge(0), textAlign: "center", position: "sticky", top: 0, zIndex: 2, background: "var(--card)", fontWeight: 700 }}
                >
                  {m === "合計" ? "合計" : `${m.slice(0, 4)}年${Number(m.slice(5))}月`}
                  {i === 0 ? "" : ""}
                </th>
              ))}
            </tr>
            <tr>
              {[...months, "合計"].map((m) => (
                <Fragment key={m}>
                  {cols.map((c, ci) => (
                    <th key={c} style={{ ...cell, ...monthEdge(ci), position: "sticky", top: 31, zIndex: 2, background: "var(--card)", color: "var(--muted)", fontWeight: 600, fontSize: 11.5 }}>
                      {COL_LABEL[c]}
                    </th>
                  ))}
                  {m === "合計" && (
                    <th style={{ ...cell, position: "sticky", top: 31, zIndex: 2, background: "var(--card)", color: "var(--muted)", fontWeight: 600, fontSize: 11.5 }}>原価率</th>
                  )}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.category}>
                {/* カテゴリーの小計 */}
                <tr style={{ background: "var(--accent-weak)" }}>
                  <td style={{ ...cell, ...sticky, background: "var(--accent-weak)", fontWeight: 700 }}>
                    {g.category}
                    <span style={{ color: "var(--muted)", fontWeight: 400, marginLeft: 6 }}>{g.list.length}品</span>
                  </td>
                  {months.map((m) => (
                    <Fragment key={m}>
                      {cols.map((c, ci) => (
                        <td key={c} style={{ ...cell, ...monthEdge(ci), fontWeight: 700 }}>{fmt(c, g.byMonth[m]?.[c] ?? 0)}</td>
                      ))}
                    </Fragment>
                  ))}
                  {cols.map((c, ci) => (
                    <td key={c} style={{ ...cell, ...monthEdge(ci), fontWeight: 700 }}>{fmt(c, g.total[c])}</td>
                  ))}
                  <td style={{ ...cell, fontWeight: 700 }}>{g.total.cost > 0 ? pct(g.total.cost, g.total.amount) : "—"}</td>
                </tr>
                {g.list.map((p, i) => {
                  const by = Object.fromEntries(p.months.map((m) => [m.month, m]));
                  return (
                    <tr key={p.name}>
                      <td style={{ ...cell, ...sticky, background: "var(--card)" }} title={nameOf(p.name)}>
                        <span style={{ display: "inline-block", width: 26, color: "var(--muted)", fontWeight: 700 }}>{i + 1}</span>
                        {nameOf(p.name)}
                      </td>
                      {months.map((m) => (
                        <Fragment key={m}>
                          {cols.map((c, ci) => {
                            const v = (by[m]?.[c] as number | undefined) ?? 0;
                            return (
                              <td key={c} style={{ ...cell, ...monthEdge(ci), color: v === 0 ? "var(--muted)" : undefined }}>
                                {v === 0 ? "·" : fmt(c, v)}
                              </td>
                            );
                          })}
                        </Fragment>
                      ))}
                      {cols.map((c, ci) => (
                        <td key={c} style={{ ...cell, ...monthEdge(ci), fontWeight: 700, color: p[c] === 0 ? "#c0392b" : undefined }}>
                          {p[c] === 0 && c === "qty" ? "0" : fmt(c, p[c])}
                        </td>
                      ))}
                      <td style={cell}>{p.hasCost && p.amount > 0 ? pct(p.cost, p.amount) : p.noCost ? "対象外" : "—"}</td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
        原価は原価表に載っている商品だけ（「—」は原価未登録）。ホットサンドの数には、セットの中のホットサンドも入っています（金額はセットの行）。
        表は縦にも横にも動かせます。商品名の列と見出しは動かしても残ります。
      </div>
    </div>
  );
}
