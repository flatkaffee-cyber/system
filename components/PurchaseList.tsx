"use client";

// 仕入れ表（仕入れのページを開いて最初に出る表）。2026-11-18 坂本さん
// 品目名は短く（牛乳・ツナ缶）、食材と備品に分け、買う先のリンクを出す。
// 中身は /api/shiire?view=sheet（lib/shiire の getPurchaseSheet）。

import { Fragment, useCallback, useEffect, useState } from "react";

type Row = {
  name: string;
  kind: "食材" | "備品";
  keys: string[];
  lastLine: string;
  lastDate: string;
  lastAmount: number;
  daysSinceLast: number;
  vendor: string;
  count: number;
  avgIntervalDays: number | null;
  totalAmount: number;
  buy: { supplier: string; url: string; price: number } | null;
};

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;

export default function PurchaseList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/shiire?view=sheet");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "読めませんでした");
      setRows(d.rows);
      setHidden(d.hidden || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "読めませんでした");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const hide = async (keys: string[], h: boolean) => {
    try {
      const r = await fetch("/api/shiire", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys, hide: h }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗");
    }
  };

  const query = q.trim().normalize("NFKC").toLowerCase();
  const list = (rows ?? []).filter((r) => !query || `${r.name} ${r.vendor} ${r.buy?.supplier ?? ""}`.toLowerCase().includes(query));

  const th: React.CSSProperties = { padding: "7px 8px", borderBottom: "1px solid var(--line)", fontSize: 12, color: "var(--muted)", textAlign: "left", whiteSpace: "nowrap", background: "#f6f3ee" };
  const td: React.CSSProperties = { padding: "7px 8px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap", fontSize: 13.5 };
  const num: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <input
        id="shiire-q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="品目・お店で絞り込む（例：牛乳、業務スーパー）"
        style={{ padding: "10px 12px", fontSize: 14 }}
      />
      {err && <p className="err">{err}</p>}
      {!rows && !err && <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>集計中…</div>}
      {rows &&
        (["食材", "備品"] as const).map((kind) => {
          const part = list.filter((r) => r.kind === kind);
          return (
            <div key={kind} className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "12px 14px", fontWeight: 800, fontSize: 15 }}>
                {kind === "食材" ? "🥬 食材" : "🧻 備品"}
                <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginLeft: 8 }}>{part.length}品目</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={th}>品目</th>
                      <th style={th}>前に買った日</th>
                      <th style={{ ...th, textAlign: "right" }}>前の金額</th>
                      <th style={{ ...th, textAlign: "right" }}>いつも</th>
                      <th style={th}>買った店</th>
                      <th style={th}>買う先</th>
                      <th style={th} />
                    </tr>
                  </thead>
                  <tbody>
                    {part.map((r) => {
                      const k = `${r.kind}:${r.name}`;
                      const isOpen = open === k;
                      return (
                        <Fragment key={k}>
                          <tr onClick={() => setOpen(isOpen ? null : k)} style={{ cursor: "pointer" }}>
                            <td style={{ ...td, fontWeight: 700 }}>{r.name}</td>
                            <td style={td}>
                              {md(r.lastDate)}
                              <span style={{ color: "var(--muted)", fontSize: 12 }}>（{r.daysSinceLast}日前）</span>
                            </td>
                            <td style={num}>{yen(r.lastAmount)}</td>
                            <td style={num}>{r.avgIntervalDays !== null ? `${r.avgIntervalDays}日ごと` : "—"}</td>
                            <td style={{ ...td, color: "var(--muted)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{r.vendor || "—"}</td>
                            <td style={td} onClick={(e) => e.stopPropagation()}>
                              {r.buy?.url ? (
                                <a href={r.buy.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, fontSize: 13 }}>
                                  {r.buy.supplier || "買う"} ↗
                                </a>
                              ) : (
                                <span style={{ color: "var(--muted)", fontSize: 12 }}>{r.buy?.supplier || "店で買う"}</span>
                              )}
                            </td>
                            <td style={td} onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => hide(r.keys, true)}
                                title="仕入れではないので、この表に出さない"
                                style={{ fontSize: 11.5, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--line)", background: "#fff", color: "var(--muted)", cursor: "pointer" }}
                              >
                                外す
                              </button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td colSpan={7} style={{ ...td, whiteSpace: "normal", fontSize: 12, color: "var(--muted)", background: "#faf8f4" }}>
                                前の領収書の書き方：{r.lastLine} ／ 買った回数 {r.count}回 ／ これまでの合計 {yen(r.totalAmount)}
                                {r.buy?.price ? ` ／ 買う先の値段 ${yen(r.buy.price)}` : ""}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      {hidden.length > 0 && (
        <div style={{ fontSize: 12.5, color: "var(--muted)", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          外した品目（{hidden.length}）：
          {hidden.map((h) => (
            <button
              key={h}
              onClick={() => hide([h], false)}
              title="仕入れ表に戻す"
              style={{ fontSize: 12, padding: "3px 8px", borderRadius: 99, border: "1px solid var(--line)", background: "#fff", cursor: "pointer" }}
            >
              {h} ↩
            </button>
          ))}
        </div>
      )}
      <p className="hint" style={{ margin: 0 }}>
        領収書から、2回以上買った物を並べています。銘柄が違っても同じ物は1行にまとめています（牛乳など）。行を押すと、領収書の書き方と合計が出ます。
        交通費・保険料、開業準備の資材は出していません。ほかに仕入れではない物は「外す」で消せます。
      </p>
    </div>
  );
}
