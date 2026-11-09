"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";
import ProductChart from "@/components/ProductChart";
import ProductSheet from "@/components/ProductSheet";

// 経営分析。/api/analytics が Square売上・領収書・原価表を自動集計する。
// 手入力の月次管理（/accounting）とは別に、実データをそのまま見るためのページ。

type Analytics = {
  period: { from: string; to: string };
  excludedEvents: {
    applied: boolean;
    windows: { date: string; fromHour: number; label: string; reason: string }[];
    sales: { label: string; sales: number; count: number; reason: string }[];
    total: number;
  };
  sales: {
    total: number; tax: number; orderCount: number;
    byDay: { day: string; sales: number; count: number }[];
    byMonth: { month: string; sales: number; count: number; days: number; perDay: number }[];
    byWeekday: { weekday: number; name: string; sales: number; count: number; days: number; avgSales: number }[];
    byTender: { tender: string; count: number; amount: number }[];
  };
  products: {
    name: string; qty: number; amount: number; cost: number;
    gross: number; rate: number | null; hasCost: boolean; noCost: boolean;
    category: string;
    months: { month: string; qty: number; amount: number; cost?: number }[];
    /** [日, 数, 売上] */
    days: [string, number, number][];
  }[];
  /** 種類ごと（ワッフルのチョコ・抹茶など）。種類が2つ以上ある商品だけ */
  variants?: {
    parent: string; variant: string; name: string; qty: number; amount: number; cost: number;
    category: string;
    months: { month: string; qty: number; amount: number; cost?: number }[];
    days: [string, number, number][];
  }[];
  productCostCoverage: {
    knownSales: number; unknownSales: number; knownCost: number; estGross: number;
  };
  expenses: {
    total: number; cogs: number; receiptCount: number;
    byCategory: { category: string; amount: number }[];
    byTag: { tag: string; amount: number }[];
  };
  pnl: {
    sales: number; theoreticalCogs: number; actualPurchases: number;
    otherExpenses: number; grossByTheory: number; cashFlow: number;
  };
};

const fmt = (n: number) => `¥${Math.round(n).toLocaleString()}`;
// 開業日。「開業から」ボタンで期間をここからにする
const OPEN_DAY = "2026-08-01";

// 売れた数の順位で3段階に分ける。上位1/4が売れ筋、下位1/4（0個を含む）が売れていない
type Rank = "top" | "mid" | "low";
const RANK_STYLE: Record<Rank, { label: string; bg: string; fg: string }> = {
  top: { label: "売れ筋", bg: "#e3f4e8", fg: "#1e7b3c" },
  mid: { label: "ふつう", bg: "#f0f0f0", fg: "#666" },
  low: { label: "売れていない", bg: "#fdecea", fg: "#c0392b" },
};
function rankProducts(products: Analytics["products"]): Record<string, Rank> {
  const sorted = [...products].sort((a, b) => b.qty - a.qty);
  const n = sorted.length;
  const out: Record<string, Rank> = {};
  sorted.forEach((p, i) => {
    out[p.name] = p.qty === 0 || i >= n - Math.ceil(n / 4) ? "low" : i < Math.ceil(n / 4) ? "top" : "mid";
  });
  return out;
}

const todayJST = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export default function Bunseki() {
  const t = todayJST();
  const [from, setFrom] = useState(t.slice(0, 8) + "01");
  const [to, setTo] = useState(t);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"pnl" | "products" | "sheet" | "graph" | "expenses" | "days" | "month" | "weekday">("pnl");
  const [openProduct, setOpenProduct] = useState<string | null>(null);
  const [productCat, setProductCat] = useState("すべて");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const res = await fetch(`/api/analytics?from=${from}&to=${to}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setData(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const setMonth = (offset: number) => {
    const d = new Date(from + "T00:00:00");
    d.setMonth(d.getMonth() + offset);
    const y = d.getFullYear(), m = d.getMonth();
    const first = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const last = new Date(y, m + 1, 0);
    const lastS = `${y}-${String(m + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
    setFrom(first);
    setTo(lastS < t ? lastS : t);
  };

  return (
    <div className="wrap" style={tab === "sheet" || tab === "graph" ? { maxWidth: 1280 } : undefined}>
      <header>
        <h1>🔍 経営分析</h1>
        <p>Square売上・領収書・原価表からの自動集計（手入力なし）</p>
      </header>
      <Nav />

      {/* 期間 */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          <button className="ghost" onClick={() => setMonth(-1)}>◀ 前月</button>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span>〜</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="ghost" onClick={() => setMonth(1)}>翌月 ▶</button>
          <button className="ghost" onClick={() => { setFrom(OPEN_DAY); setTo(t); }}>開業から</button>
        </div>
      </div>

      {err && <p className="err" style={{ textAlign: "center" }}>{err}</p>}
      {loading && <p style={{ textAlign: "center", color: "var(--muted)" }}>集計中...</p>}

      {data && !loading && (
        <>
          {/* サマリ */}
          <div className="card total-card">
            <div className="total-label">{data.period.from} 〜 {data.period.to}</div>
            <div className="total-amount">{fmt(data.sales.total)}</div>
            <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 12, opacity: 0.85, flexWrap: "wrap" }}>
              <span>{data.sales.orderCount}件</span>
              <span>客単価 {data.sales.orderCount ? fmt(data.sales.total / data.sales.orderCount) : "—"}</span>
              <span>理論粗利 {fmt(data.pnl.grossByTheory)}</span>
              <span>支出 {fmt(data.expenses.total)}</span>
            </div>
          </div>

          {data.excludedEvents?.applied && data.excludedEvents.total > 0 && (
            <div className="card" style={{ padding: "10px 14px", background: "#fdf6ec", borderColor: "#e8d5b0" }}>
              <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                <strong>通常営業でない日を分析から外しています。</strong>
                <br />
                {data.excludedEvents.sales.map((e) => (
                  <span key={e.label} style={{ display: "block" }}>
                    ・{e.label}（{e.reason}） {fmt(e.sales)} / {e.count}件
                  </span>
                ))}
                平常日と混ぜると、曜日別や時間帯別の平均が実態からずれるためです。
              </div>
            </div>
          )}

          <div className="sub-tabs">
            {([["pnl", "損益"], ["products", "商品別"], ["sheet", "表"], ["graph", "グラフ"], ["expenses", "支出"], ["days", "日別"], ["month", "月別"], ["weekday", "曜日別"]] as const).map(([k, l]) => (
              <button key={k} className={`sub-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>

          {/* 損益 */}
          {tab === "pnl" && (
            <div className="card">
              <div className="cat-title">この期間の実態</div>
              {[
                ["売上高（Square実績）", data.pnl.sales],
                ["理論原価（原価表 × 売れた数）", -data.pnl.theoreticalCogs],
                ["理論粗利", data.pnl.grossByTheory],
              ].map(([l, v]) => (
                <div key={l as string} className="result-row">
                  <span>{l as string}</span>
                  <span className="mono" style={{ fontWeight: 700, color: (v as number) < 0 ? "#c0392b" : undefined }}>
                    {fmt(Math.abs(v as number))}{(v as number) < 0 ? " −" : ""}
                  </span>
                </div>
              ))}
              <div style={{ borderTop: "2px solid var(--line)", marginTop: 8, paddingTop: 8 }}>
                {[
                  ["実際の仕入（領収書の仕入高）", data.pnl.actualPurchases],
                  ["その他の支出（消耗品・経費等）", data.pnl.otherExpenses],
                  ["キャッシュフロー（売上 − 全支出）", data.pnl.cashFlow],
                ].map(([l, v]) => (
                  <div key={l as string} className="result-row">
                    <span>{l as string}</span>
                    <span className="mono" style={{ fontWeight: 700, color: (l as string).startsWith("キャッシュ") && (v as number) < 0 ? "#c0392b" : undefined }}>
                      {fmt(v as number)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="hint" style={{ marginTop: 10 }}>
                理論原価＝原価表の1皿原価×売れた数。実際の仕入は買い置き分も含むため、
                開業期は仕入が先行して大きく出ます。日常の判断は理論粗利、
                資金繰りはキャッシュフローを見てください。
              </p>
              {data.productCostCoverage.unknownSales > 0 && (
                <p className="hint" style={{ color: "#c0392b" }}>
                  ⚠ 売上のうち {fmt(data.productCostCoverage.unknownSales)} は原価表に無い商品のため、
                  理論原価に含まれていません（商品別タブで「原価未登録」を確認）。
                </p>
              )}
            </div>
          )}

          {/* エクセルのような表。商品をカテゴリーごとに並べ、横に月ごとの数・売上・原価 */}
          {tab === "sheet" && (
            <div className="card">
              <div className="cat-title">商品の表（カテゴリー別・月ごと）</div>
              <ProductSheet
                products={data.products}
                variants={data.variants ?? []}
                openDays={Object.fromEntries(data.sales.byMonth.map((m) => [m.month, m.days]))}
              />
            </div>
          )}

          {/* 商品のグラフ。商品を選んで、個数・売上を月・週・曜日で見る */}
          {tab === "graph" && (
            <div className="card">
              <div className="cat-title">商品のグラフ</div>
              <ProductChart products={data.products} variants={data.variants ?? []} openDays={data.sales.byDay.map((d) => d.day)} />
            </div>
          )}

          {/* 商品別 */}
          {tab === "products" && (() => {
            const ranks = rankProducts(data.products);
            const cats = ["すべて", ...Array.from(new Set(data.products.map((p) => p.category)))];
            const list = data.products.filter((p) => productCat === "すべて" || p.category === productCat);
            const maxAmount = Math.max(1, ...data.products.map((p) => p.amount));
            const days = data.sales.byDay.length || 1;
            const daysOf = (m: string) => data.sales.byMonth.find((x) => x.month === m)?.days || 0;
            const count = (r: Rank) => data.products.filter((p) => ranks[p.name] === r).length;
            return (
              <div className="card">
                <div className="cat-title">商品別の売れ行き（{days}営業日）</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12, marginBottom: 8 }}>
                  {(["top", "mid", "low"] as const).map((r) => (
                    <span key={r} style={{ background: RANK_STYLE[r].bg, color: RANK_STYLE[r].fg, padding: "2px 8px", borderRadius: 10 }}>
                      {RANK_STYLE[r].label} {count(r)}品
                    </span>
                  ))}
                </div>
                <div className="sub-tabs" style={{ marginBottom: 8 }}>
                  {cats.map((c) => (
                    <button key={c} className={`sub-tab ${productCat === c ? "active" : ""}`} onClick={() => setProductCat(c)}>{c}</button>
                  ))}
                </div>
                <p className="hint" style={{ marginTop: 0 }}>商品をタップすると月ごとの数と売上が出ます。期間を「開業から」にすると全部の月を比べられます。</p>
                {list.map((p) => {
                  const r = ranks[p.name];
                  const open = openProduct === p.name;
                  const maxQty = Math.max(1, ...p.months.map((m) => m.qty));
                  return (
                    <div key={p.name} style={{ borderBottom: "1px solid var(--line)" }}>
                      <button
                        onClick={() => setOpenProduct(open ? null : p.name)}
                        style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", padding: "8px 2px", boxSizing: "border-box" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {open ? "▾" : "▸"} {p.name === "不明" ? "金額だけの注文" : p.name}
                          </span>
                          <span style={{ background: RANK_STYLE[r].bg, color: RANK_STYLE[r].fg, fontSize: 11, padding: "1px 7px", borderRadius: 10, whiteSpace: "nowrap" }}>
                            {RANK_STYLE[r].label}
                          </span>
                          <span className="mono" style={{ width: 52, textAlign: "right" }}>{p.qty}個</span>
                          <span className="mono" style={{ width: 78, textAlign: "right", fontWeight: 700 }}>{fmt(p.amount)}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                          <div style={{ flex: 1, height: 5, background: "var(--line)", borderRadius: 3 }}>
                            <div style={{ width: `${(p.amount / maxAmount) * 100}%`, height: "100%", background: RANK_STYLE[r].fg, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, color: "var(--muted)", width: 130, textAlign: "right" }}>
                            1日 {(p.qty / days).toFixed(1)}個 ・ 原価率 {p.hasCost && p.rate !== null ? `${p.rate}%` : p.noCost ? "対象外" : "—"}
                          </span>
                        </div>
                      </button>
                      {open && (
                        <div style={{ padding: "4px 4px 12px 18px", fontSize: 12.5 }}>
                          {p.months.length === 0 && <div style={{ color: "#c0392b" }}>この期間は1つも売れていません</div>}
                          {p.months.map((m) => (
                            <div key={m.month} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                              <span style={{ width: 44 }}>{Number(m.month.slice(5))}月</span>
                              <div style={{ flex: 1, height: 10, background: "var(--line)", borderRadius: 3 }}>
                                <div style={{ width: `${(m.qty / maxQty) * 100}%`, height: "100%", background: "#4a7c59", borderRadius: 3 }} />
                              </div>
                              <span className="mono" style={{ width: 44, textAlign: "right" }}>{m.qty}個</span>
                              <span className="mono" style={{ width: 72, textAlign: "right" }}>{fmt(m.amount)}</span>
                              <span style={{ width: 70, textAlign: "right", color: "var(--muted)" }}>
                                1日 {daysOf(m.month) ? (m.qty / daysOf(m.month)).toFixed(1) : "—"}個
                              </span>
                            </div>
                          ))}
                          {p.hasCost && <div style={{ color: "var(--muted)", marginTop: 4 }}>期間の粗利 {fmt(p.gross)}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="hint" style={{ marginTop: 10 }}>
                  売れ筋・売れていないは、売れた数の上位1/4・下位1/4です（メニューにあって0個の商品は売れていないに入ります）。
                  セットに入ったホットサンドは数にだけ足しているので、売上は0円のことがあります。
                </p>
              </div>
            );
          })()}

          {/* 支出 */}
          {tab === "expenses" && (
            <>
              <div className="card">
                <div className="cat-title">科目別（領収書 {data.expenses.receiptCount}件 / {fmt(data.expenses.total)}）</div>
                {data.expenses.byCategory.map((c) => (
                  <div key={c.category} className="result-row">
                    <span>{c.category}</span>
                    <span className="mono" style={{ fontWeight: 700 }}>{fmt(c.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="cat-title">用途タグ別 上位</div>
                {data.expenses.byTag.map((tg) => (
                  <div key={tg.tag} className="result-row">
                    <span>{tg.tag}</span>
                    <span className="mono">{fmt(tg.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 月別 */}
          {tab === "month" && (
            <div className="card">
              <div className="cat-title">月別売上</div>
              {data.sales.byMonth.length === 0 ? (
                <p style={{ color: "var(--muted)", fontSize: 13 }}>データがありません。</p>
              ) : (
                data.sales.byMonth.map((m) => {
                  const max = Math.max(...data.sales.byMonth.map((x) => x.sales), 1);
                  return (
                    <div key={m.month} style={{ padding: "8px 0", borderBottom: "1px solid var(--line-soft, #eee)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{m.month.replace("-", "年")}月</span>
                        <span className="mono" style={{ fontWeight: 700 }}>{fmt(m.sales)}</span>
                      </div>
                      <div style={{ background: "var(--line)", borderRadius: 4, height: 14, overflow: "hidden" }}>
                        <div style={{ width: `${(m.sales / max) * 100}%`, height: "100%", background: "var(--accent)" }} />
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
                        営業{m.days}日 ・ 1日平均 {fmt(m.perDay)} ・ {m.count}件
                      </div>
                    </div>
                  );
                })
              )}
              <p className="hint" style={{ marginTop: 10 }}>
                月をまたいで比べるときは「1日平均」を見てください。営業日数が違うと合計では比べられません。
              </p>
            </div>
          )}

          {/* 曜日別 */}
          {tab === "weekday" && (
            <div className="card">
              <div className="cat-title">曜日別売上（1日あたりの平均）</div>
              {data.sales.byWeekday.length === 0 ? (
                <p style={{ color: "var(--muted)", fontSize: 13 }}>データがありません。</p>
              ) : (
                // 週は月曜始まりで並べる
                [...data.sales.byWeekday].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7)).map((w) => {
                  const max = Math.max(...data.sales.byWeekday.map((x) => x.avgSales), 1);
                  const color = w.weekday === 0 ? "#c0392b" : w.weekday === 6 ? "#2980b9" : "var(--ink)";
                  return (
                    <div key={w.weekday} style={{ display: "grid", gridTemplateColumns: "34px 1fr 90px 52px", gap: 8, alignItems: "center", padding: "5px 0", fontSize: 13 }}>
                      <span style={{ fontWeight: 800, color }}>{w.name}</span>
                      <div style={{ background: "var(--line)", borderRadius: 4, height: 16, overflow: "hidden" }}>
                        <div style={{ width: `${(w.avgSales / max) * 100}%`, height: "100%", background: "var(--accent)" }} />
                      </div>
                      <span className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{fmt(w.avgSales)}</span>
                      <span className="mono" style={{ textAlign: "right", color: "var(--muted)", fontSize: 11.5 }}>{w.days}日</span>
                    </div>
                  );
                })
              )}
              <p className="hint" style={{ marginTop: 10 }}>
                棒の長さは1日あたりの平均売上です。右端は集計に入った営業日数で、
                日数が少ない曜日はまだ当てになりません。
              </p>
            </div>
          )}

          {/* 日別 */}
          {tab === "days" && (
            <div className="card">
              <div className="cat-title">日別売上</div>
              {data.sales.byDay.map((d) => {
                const max = Math.max(...data.sales.byDay.map((x) => x.sales), 1);
                return (
                  <div key={d.day} style={{ display: "grid", gridTemplateColumns: "84px 1fr 90px 44px", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 13 }}>
                    <span className="mono">{d.day.slice(5)}</span>
                    <div style={{ background: "var(--line)", borderRadius: 4, height: 14, overflow: "hidden" }}>
                      <div style={{ width: `${(d.sales / max) * 100}%`, height: "100%", background: "var(--accent)" }} />
                    </div>
                    <span className="mono" style={{ textAlign: "right", fontWeight: 600 }}>{fmt(d.sales)}</span>
                    <span className="mono" style={{ textAlign: "right", color: "var(--muted)" }}>{d.count}件</span>
                  </div>
                );
              })}
              <div className="result-row" style={{ borderTop: "2px solid var(--line)", marginTop: 8, paddingTop: 8 }}>
                <span style={{ fontWeight: 700 }}>支払方法別</span><span />
              </div>
              {data.sales.byTender.map((tn) => (
                <div key={tn.tender} className="result-row">
                  <span>{tn.tender} <span style={{ color: "var(--muted)", fontSize: 12 }}>{tn.count}件</span></span>
                  <span className="mono">{fmt(tn.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
