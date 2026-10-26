"use client";

import { useState, useEffect, useCallback } from "react";

// 原価の見直し（メニュー → 原価の見直し）。
// 材料ごとに、レシピに入っている仕入値と、品目台帳（レシート・注文）の最近の買値（1個あたり）を並べる。
// レシートを保存すると自動で入るが、値段が大きく外れたもの（1パックの量が違う品など）は自動では入れないので、ここで確かめて入れる。

type Row = {
  name: string;
  unit: string;
  capacity: number;
  purchasePrice: number;
  priceFrom: { date: string; name: string; vendor?: string } | null;
  usedIn: string[];
  link: string | null;
  linkManual: boolean;
  linkFound: boolean;
  latest: { date: string; vendor: string; name: string; unitPrice: number; qty: number } | null;
  diffPct: number | null;
  bigGap: boolean;
};
type Filter = "gap" | "unlinked" | "all";

const yen = (n: number) => `¥${n.toLocaleString()}`;

export default function CostReview({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [choices, setChoices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState<Filter>("gap");
  const [busy, setBusy] = useState("");
  const [linking, setLinking] = useState<{ name: string; value: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/menu/costs");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setRows(d.rows || []);
      setChoices(d.choices || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (body: Record<string, unknown>, done: string) => {
    setBusy(String(body.name));
    setErr("");
    try {
      const res = await fetch("/api/menu/costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "保存に失敗");
      setMsg(done);
      setLinking(null);
      await load();
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗");
    } finally {
      setBusy("");
    }
  };

  const gap = rows.filter((r) => r.latest && r.diffPct !== null && r.diffPct !== 0);
  const unlinked = rows.filter((r) => !r.linkFound);
  const shown = filter === "gap" ? gap : filter === "unlinked" ? unlinked : rows;

  return (
    <>
      {err && <p className="err">{err}</p>}
      {msg && <div className="card" style={{ padding: "10px 14px", fontWeight: 700, color: "var(--ok)" }}>✓ {msg}</div>}

      <div className="card" style={{ padding: "12px 14px", fontSize: 13, lineHeight: 1.7, color: "var(--muted)" }}>
        レシートを保存すると、材料につながっている品目の値段（1個あたり）でレシピの仕入値が自動で入ります。
        いまの値段の半分未満・1.5倍超のものは、量の違う品を買った可能性があるので自動では入れず、ここに出します。
      </div>

      <div className="sub-tabs">
        {([
          ["gap", `買値とずれている（${gap.length}）`],
          ["unlinked", `つながっていない（${unlinked.length}）`],
          ["all", `全部（${rows.length}）`],
        ] as const).map(([k, label]) => (
          <button key={k} className={`sub-tab ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>読み込み中…</div>}

      {!loading && shown.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 16, color: "var(--muted)" }}>該当する材料はありません</div>
      )}

      <datalist id="cr-items">
        {choices.map((c) => <option key={c} value={c} />)}
      </datalist>

      {!loading && shown.map((r) => {
        const isBusy = busy === r.name;
        return (
          <div key={r.name} className="card" style={{ padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14.5 }}>{r.name}</strong>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                {r.usedIn.length}品で使用（{r.usedIn.slice(0, 3).join("・")}{r.usedIn.length > 3 ? "ほか" : ""}）
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
              <div style={{ padding: "8px 10px", borderRadius: 10, background: "#f4f2ee" }}>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>レシピの仕入値</div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>
                  {r.purchasePrice ? yen(r.purchasePrice) : "未入力"}
                  <span style={{ fontWeight: 400, fontSize: 12, color: "var(--muted)" }}> / {r.capacity}{r.unit}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  {r.priceFrom ? `${r.priceFrom.date} のレシートから` : "手で入れた値"}
                </div>
              </div>
              <div style={{ padding: "8px 10px", borderRadius: 10, background: r.bigGap ? "#fdf0e6" : "#f4f2ee" }}>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>最近の買値（1個あたり）</div>
                {r.latest ? (
                  <>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>
                      {yen(r.latest.unitPrice)}
                      {r.diffPct !== null && r.diffPct !== 0 && (
                        <span style={{ marginLeft: 6, fontSize: 12, color: r.diffPct > 0 ? "#c0392b" : "var(--ok)" }}>
                          {r.diffPct > 0 ? "+" : ""}{r.diffPct}%
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>
                      {r.latest.date}・{r.latest.vendor}<br />{r.latest.name.slice(0, 40)}
                      {r.latest.qty > 1 && `（${r.latest.qty}個で割った値）`}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
                    {r.link ? `「${r.link}」の買い物が見つかりません` : "台帳の品目につながっていません"}
                  </div>
                )}
              </div>
            </div>

            {r.bigGap && (
              <p className="hint" style={{ margin: "6px 0 0", color: "#9c5f22" }}>
                値段が大きく違います。容量（{r.capacity}{r.unit}）と同じ量の品か確かめてから入れてください。
              </p>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
              {r.latest && r.diffPct !== 0 && (
                <button
                  // 大きくずれているものは量の違う品のことが多いので、目立たせずに確かめてから入れる
                  className={r.bigGap ? undefined : "primary"}
                  disabled={isBusy}
                  onClick={() =>
                    (!r.bigGap ||
                      confirm(`${r.name}の仕入値を ${yen(r.latest!.unitPrice)} にしますか？\n容量（${r.capacity}${r.unit}）と同じ量の品か確かめてください。`)) &&
                    post(
                      {
                        name: r.name,
                        purchasePrice: r.latest!.unitPrice,
                        priceFrom: { date: r.latest!.date, name: r.latest!.name, vendor: r.latest!.vendor },
                      },
                      `${r.name}の仕入値を ${yen(r.latest!.unitPrice)} にしました`,
                    )
                  }
                  style={{ fontSize: 12.5 }}
                >
                  {isBusy ? "…" : `${yen(r.latest.unitPrice)} にする`}
                </button>
              )}
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                つなぎ先：<strong style={{ color: "var(--ink)" }}>{r.link ?? "なし"}</strong>
                {r.link && !r.linkManual && "（名前から自動）"}
              </span>
              <button style={{ fontSize: 12 }} onClick={() => setLinking(linking?.name === r.name ? null : { name: r.name, value: r.link ?? "" })}>
                つなぎ先を変える
              </button>
            </div>

            {linking?.name === r.name && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = linking.value.trim();
                  post({ name: r.name, ledgerItem: v || null }, v ? `${r.name}を「${v}」につなぎました` : `${r.name}のつなぎ先を自動に戻しました`);
                }}
                style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}
              >
                <input
                  list="cr-items"
                  value={linking.value}
                  onChange={(e) => setLinking({ name: r.name, value: e.target.value })}
                  placeholder="品目台帳の品目（空にすると自動）"
                  style={{ flex: 1, minWidth: 180 }}
                />
                <button type="submit" className="primary" disabled={isBusy} style={{ fontSize: 12.5 }}>保存</button>
              </form>
            )}
          </div>
        );
      })}
    </>
  );
}
