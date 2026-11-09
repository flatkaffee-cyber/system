"use client";

// 仕入れの「毎月の金額」。仕入れた品目ごとに、毎月いくら出ていっているかをエクセルのような表で見る。
// 科目（仕入高・消耗品費など）ごとにまとめ、小計を付ける。金額は領収書の明細から（lib/shiire の months）。
// 2026-11-09 坂本さん「仕入れた品目ごとに毎月いくら出ていっているのかも見たい。画面を大きく使って」

import { Fragment, useMemo, useState } from "react";

export type MonthlyStat = {
  name: string;
  displayName: string;
  category: string;
  vendor: string;
  count: number;
  totalAmount: number;
  months?: Record<string, number>;
};

const yen = (n: number) => (n ? `¥${Math.round(n).toLocaleString()}` : "·");

export default function PurchaseMonthly({ stats }: { stats: MonthlyStat[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("すべて");
  const [sortBy, setSortBy] = useState<"total" | "name">("total");

  const months = useMemo(
    () => [...new Set(stats.flatMap((s) => Object.keys(s.months ?? {})))].sort(),
    [stats],
  );
  const cats = useMemo(() => {
    const t = new Map<string, number>();
    for (const s of stats) t.set(s.category, (t.get(s.category) ?? 0) + s.totalAmount);
    return [...t.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [stats]);

  const query = q.trim().toLowerCase();
  const groups = useMemo(() => {
    const by = new Map<string, MonthlyStat[]>();
    for (const s of stats) {
      if (cat !== "すべて" && s.category !== cat) continue;
      if (query && !`${s.displayName} ${s.vendor} ${s.category}`.toLowerCase().includes(query)) continue;
      by.set(s.category, [...(by.get(s.category) ?? []), s]);
    }
    return [...by.entries()]
      .map(([category, list]) => {
        const sorted = [...list].sort((a, b) =>
          sortBy === "total" ? b.totalAmount - a.totalAmount : a.displayName.localeCompare(b.displayName, "ja"),
        );
        const byMonth: Record<string, number> = {};
        let total = 0;
        for (const s of list) {
          total += s.totalAmount;
          for (const [m, v] of Object.entries(s.months ?? {})) byMonth[m] = (byMonth[m] ?? 0) + v;
        }
        return { category, list: sorted, byMonth, total };
      })
      .sort((a, b) => b.total - a.total);
  }, [stats, cat, query, sortBy]);

  const all = useMemo(() => {
    const byMonth: Record<string, number> = {};
    let total = 0;
    for (const g of groups) {
      total += g.total;
      for (const [m, v] of Object.entries(g.byMonth)) byMonth[m] = (byMonth[m] ?? 0) + v;
    }
    return { byMonth, total };
  }, [groups]);

  const cell: React.CSSProperties = {
    padding: "6px 10px", borderBottom: "1px solid var(--line)", textAlign: "right", whiteSpace: "nowrap",
  };
  const first: React.CSSProperties = {
    position: "sticky", left: 0, zIndex: 1, textAlign: "left", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis",
  };
  const head: React.CSSProperties = { position: "sticky", top: 0, zIndex: 2, background: "var(--card)", fontWeight: 700 };
  const chip = (on: boolean): React.CSSProperties => ({
    padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
    border: on ? "2px solid var(--accent)" : "1px solid var(--line)",
    background: on ? "var(--accent-weak)" : "var(--card)", color: "var(--ink)",
  });
  const mLabel = (m: string) => `${m.slice(2, 4)}年${Number(m.slice(5))}月`;

  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="品目・購入先で絞り込む（例：業務スーパー）"
        style={{ padding: "10px 12px", fontSize: 14 }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {["すべて", ...cats].map((c) => (
          <button key={c} style={chip(cat === c)} onClick={() => setCat(c)}>{c}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button style={chip(sortBy === "total")} onClick={() => setSortBy("total")}>金額の多い順</button>
        <button style={chip(sortBy === "name")} onClick={() => setSortBy("name")}>名前順</button>
      </div>

      <div style={{ overflow: "auto", maxHeight: "75vh", border: "1px solid var(--line)", borderRadius: 8 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 13, fontVariantNumeric: "tabular-nums", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...cell, ...first, ...head, zIndex: 3 }}>品目</th>
              <th style={{ ...cell, ...head, textAlign: "left" }}>購入先（前回）</th>
              {months.map((m) => (
                <th key={m} style={{ ...cell, ...head }}>{mLabel(m)}</th>
              ))}
              <th style={{ ...cell, ...head }}>合計</th>
              <th style={{ ...cell, ...head }}>回数</th>
            </tr>
          </thead>
          <tbody>
            {/* 全部の合計 */}
            <tr style={{ background: "var(--accent-weak)" }}>
              <td style={{ ...cell, ...first, background: "var(--accent-weak)", fontWeight: 800 }}>全部の合計</td>
              <td style={cell} />
              {months.map((m) => (
                <td key={m} style={{ ...cell, fontWeight: 800 }}>{yen(all.byMonth[m] ?? 0)}</td>
              ))}
              <td style={{ ...cell, fontWeight: 800 }}>{yen(all.total)}</td>
              <td style={cell} />
            </tr>
            {groups.map((g) => (
              <Fragment key={g.category}>
                <tr style={{ background: "#f6f3ee" }}>
                  <td style={{ ...cell, ...first, background: "#f6f3ee", fontWeight: 700 }}>
                    {g.category}
                    <span style={{ color: "var(--muted)", fontWeight: 400, marginLeft: 6 }}>{g.list.length}品目</span>
                  </td>
                  <td style={cell} />
                  {months.map((m) => (
                    <td key={m} style={{ ...cell, fontWeight: 700 }}>{yen(g.byMonth[m] ?? 0)}</td>
                  ))}
                  <td style={{ ...cell, fontWeight: 700 }}>{yen(g.total)}</td>
                  <td style={cell} />
                </tr>
                {g.list.map((s) => (
                  <tr key={s.name}>
                    <td style={{ ...cell, ...first, background: "var(--card)" }} title={s.displayName}>{s.displayName}</td>
                    <td style={{ ...cell, textAlign: "left", color: "var(--muted)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }} title={s.vendor}>
                      {s.vendor || "—"}
                    </td>
                    {months.map((m) => {
                      const v = s.months?.[m] ?? 0;
                      return (
                        <td key={m} style={{ ...cell, color: v ? undefined : "var(--muted)" }}>{yen(v)}</td>
                      );
                    })}
                    <td style={{ ...cell, fontWeight: 700 }}>{yen(s.totalAmount)}</td>
                    <td style={cell}>{s.count}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
        領収書の明細から、品目ごとに月の金額を足しています（同じ品目は名前をそろえてまとめています）。
        表は縦にも横にも動かせます。品目の列と見出しは動かしても残ります。
      </div>
    </div>
  );
}
