"use client";

import { Fragment, useState, useEffect, useCallback } from "react";

// 品目別の購入台帳。仕訳とは別に「何を何回いくらで買ったか」を積み上げて見る。

type Buy = { date: string; vendor: string; name: string; amount: number; category: string };
type Ledger = {
  item: string;
  count: number;
  total: number;
  first: string;
  last: string;
  daysSinceLast: number;
  avgIntervalDays: number | null;
  categories: string[];
  vendors: string[];
  buys: Buy[];
};

const yen = (n: number) => `¥${n.toLocaleString()}`;

// エクセルの表のように並べる（2026-11-19 坂本さん）
type SortKey = "item" | "category" | "count" | "total" | "unit" | "last" | "days" | "interval" | "vendor";
const COLS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: "item", label: "品目" },
  { key: "category", label: "科目" },
  { key: "count", label: "回数", num: true },
  { key: "total", label: "合計", num: true },
  { key: "unit", label: "1回あたり", num: true },
  { key: "last", label: "前回", num: true },
  { key: "days", label: "何日前", num: true },
  { key: "interval", label: "平均の間隔", num: true },
  { key: "vendor", label: "主な仕入先" },
];
const th: React.CSSProperties = {
  position: "sticky", top: 0, zIndex: 1, padding: "8px 10px", background: "#efe9df",
  borderBottom: "1px solid #d8cfc0", borderRight: "1px solid #e4dccb", fontSize: 12, whiteSpace: "nowrap", userSelect: "none",
};
const td: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid #ece6db", borderRight: "1px solid #f1ece3", whiteSpace: "nowrap" };
const num: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const tf: React.CSSProperties = { ...td, position: "sticky", bottom: 0, background: "#efe9df", fontWeight: 800, borderTop: "1px solid #d8cfc0" };

function sortValue(l: Ledger, k: SortKey): string | number {
  switch (k) {
    case "item": return l.item;
    case "category": return l.categories.join("・");
    case "count": return l.count;
    case "total": return l.total;
    case "unit": return l.total / Math.max(1, l.count);
    case "last": return l.last;
    case "days": return l.daysSinceLast;
    case "interval": return l.avgIntervalDays ?? Number.MAX_SAFE_INTEGER;
    case "vendor": return l.vendors[0] ?? "";
  }
}

export default function ItemsPage() {
  const [d, setD] = useState<{
    items: number;
    total: number;
    unclassifiedCount: number;
    unclassifiedTotal: number;
    ledgers: Ledger[];
    unclassified: Buy[];
  } | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // 未分類に品目を割り当てるための状態。
  // 選択肢は既存の品目一覧（/api/items-map）から出し、新しい名前も打てる
  const [itemNames, setItemNames] = useState<string[]>([]);
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/items-ledger");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "取得失敗");
      setD(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    }
  }, []);

  useEffect(() => {
    load();
    fetch("/api/items-map")
      .then((r) => r.json())
      .then((j) => setItemNames(j.items ?? []))
      .catch(() => {});
  }, [load]);

  // 「この品名はこの品目」と覚えさせる。以降は同じ品名が自動で分類される
  async function saveAssign(name: string) {
    const item = (assign[name] || "").trim();
    if (!item) return;
    setSaving(name);
    try {
      const res = await fetch("/api/items-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: name, item }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "保存失敗");
      setSavedMsg(`「${item}」として覚えました`);
      if (!itemNames.includes(item)) setItemNames((p) => [...p, item].sort());
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失敗");
    } finally {
      setSaving(null);
    }
  }

  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "total", desc: true });
  const list = (d?.ledgers ?? []).filter(
    (l) => !q || l.item.includes(q) || l.vendors.some((v) => v.includes(q)) || l.categories.some((c) => c.includes(q)),
  );
  const sorted = [...list].sort((a, b) => {
    const x = sortValue(a, sort.key);
    const y = sortValue(b, sort.key);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ja");
    return sort.desc ? -c : c;
  });

  return (
    <div className="wrap" style={{ maxWidth: 1280 }}>
      <header>
        <h1>🧺 品目台帳</h1>
        <p>仕訳とは別に、何を何回いくらで買ったかを積み上げています</p>
      </header>

      {err && <p className="err">{err}</p>}

      {d && (
        <div className="card total-card">
          <div className="total-label">品目 {d.items}種類の仕入・購入</div>
          <div className="total-amount">{yen(d.total)}</div>
          {d.unclassifiedCount > 0 && (
            <div style={{ marginTop: 6, fontSize: 12.5, opacity: 0.85 }}>
              未分類 {d.unclassifiedCount}件（{yen(d.unclassifiedTotal)}）
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="品目・仕入先・科目で絞り込み（例: ペーパー、業務スーパー）" />
      </div>

      {d && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto", maxHeight: "75vh", overflowY: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => setSort((p) => ({ key: c.key, desc: p.key === c.key ? !p.desc : c.key !== "item" }))}
                      style={{ ...th, textAlign: c.num ? "right" : "left", cursor: "pointer" }}
                      title="押すと並べ替え"
                    >
                      {c.label}
                      {sort.key === c.key ? (sort.desc ? " ▼" : " ▲") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((l, idx) => {
                  const isOpen = open === l.item;
                  const zebra = idx % 2 ? "#fbf9f5" : "#fff";
                  return (
                    <Fragment key={l.item}>
                      <tr onClick={() => setOpen(isOpen ? null : l.item)} style={{ cursor: "pointer", background: isOpen ? "#fdf1e3" : zebra }}>
                        <td style={{ ...td, fontWeight: 700 }}>{isOpen ? "▾ " : "▸ "}{l.item}</td>
                        <td style={{ ...td, color: "var(--muted)" }}>{l.categories.join("・")}</td>
                        <td style={num}>{l.count}</td>
                        <td style={{ ...num, fontWeight: 700 }}>{yen(l.total)}</td>
                        <td style={num}>{yen(Math.round(l.total / Math.max(1, l.count)))}</td>
                        <td style={num}>{l.last.slice(5).replace("-", "/")}</td>
                        <td style={num}>{l.daysSinceLast}日前</td>
                        <td style={num}>{l.avgIntervalDays !== null ? `${l.avgIntervalDays}日` : "—"}</td>
                        <td style={{ ...td, color: "var(--muted)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {l.vendors.slice(0, 3).join("・")}{l.vendors.length > 3 ? ` ほか${l.vendors.length - 3}` : ""}
                        </td>
                      </tr>
                      {isOpen &&
                        l.buys.map((b, i) => (
                          <tr key={i} style={{ background: "#faf6ef", fontSize: 12 }}>
                            <td style={{ ...td, paddingLeft: 26, color: "var(--muted)", whiteSpace: "normal" }}>{b.name}</td>
                            <td style={{ ...td, color: "var(--muted)" }}>{b.category}</td>
                            <td style={num} />
                            <td style={num}>{yen(b.amount)}</td>
                            <td style={num} />
                            <td style={num}>{b.date.slice(5).replace("-", "/")}</td>
                            <td style={num} />
                            <td style={num} />
                            <td style={{ ...td, color: "var(--muted)" }}>{b.vendor}</td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...tf }}>合計（{sorted.length}品目）</td>
                  <td style={tf} />
                  <td style={{ ...tf, textAlign: "right" }}>{sorted.reduce((n, l) => n + l.count, 0)}</td>
                  <td style={{ ...tf, textAlign: "right" }}>{yen(sorted.reduce((n, l) => n + l.total, 0))}</td>
                  <td style={tf} colSpan={5} />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="hint" style={{ margin: 0, padding: "8px 12px" }}>
            見出しを押すと並べ替えます。行を押すと、その品目の買った記録が下に開きます。
          </p>
        </div>
      )}

      {d && d.unclassified.length > 0 && (
        <div className="card">
          <div className="cat-title">未分類に品目を割り当てる</div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 10px" }}>
            品目を選んで✓を押すと覚えます。同じ品名は以降ずっと自動で分類されます。
            一覧にない品目は、そのまま入力すれば新しく作られます。
          </p>
          {savedMsg && <p style={{ fontSize: 12.5, color: "var(--ok)", fontWeight: 700 }}>{savedMsg}</p>}
          <datalist id="item-options">
            {itemNames.map((n) => <option key={n} value={n} />)}
          </datalist>
          {(() => {
            // 同じ品名はまとめて金額を合計する
            const g = new Map<string, { amount: number; count: number; vendor: string }>();
            for (const b of d.unclassified) {
              const cur = g.get(b.name) ?? { amount: 0, count: 0, vendor: b.vendor };
              cur.amount += b.amount;
              cur.count += 1;
              g.set(b.name, cur);
            }
            return [...g.entries()]
              .sort((a, b) => b[1].amount - a[1].amount)
              .slice(0, 40)
              .map(([name, v]) => (
                <div key={name} style={{ padding: "9px 0", borderTop: "1px solid var(--line-soft, #eee)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                      {name.slice(0, 60)}
                      <span style={{ color: "var(--muted)" }}>（{v.vendor}・{v.count}回）</span>
                    </span>
                    <span className="mono" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{yen(v.amount)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <input
                      list="item-options"
                      placeholder="品目を選ぶか入力"
                      value={assign[name] ?? ""}
                      onChange={(e) => setAssign((p) => ({ ...p, [name]: e.target.value }))}
                      style={{ flex: 1, fontSize: 13, padding: "7px 10px" }}
                    />
                    <button
                      onClick={() => saveAssign(name)}
                      disabled={!(assign[name] || "").trim() || saving === name}
                      style={{
                        padding: "0 16px", borderRadius: 8, fontWeight: 800, fontSize: 15,
                        border: "none", cursor: "pointer",
                        background: (assign[name] || "").trim() ? "var(--ok)" : "var(--line)",
                        color: "#fff",
                      }}
                    >
                      {saving === name ? "…" : "✓"}
                    </button>
                  </div>
                </div>
              ));
          })()}
        </div>
      )}
    </div>
  );
}
