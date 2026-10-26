"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// Uber Eats の注文（Squareに入らない分）を見る画面。取り込み口も兼ねる。
// Uber Eats Manager のページは外のサイトへの通信を止めているので、
// 向こうのタブからこの画面を ?import=1 で開き、postMessage で注文を受け取って保存する。
// 受け取るのは merchants.ubereats.com から来たものだけ。

const UBER_ORIGIN = "https://merchants.ubereats.com";

type Summary = {
  count: number;
  canceled: number;
  subtotal: number;
  net: number;
  weeks: number;
  lastImportedOrder: string | null;
  byWeek: { monday: string; count: number; subtotal: number; net: number }[];
  byItem: { name: string; qty: number }[];
  hotsandPerWeek: { weekday: string; classic: number; garden: number; orders: number }[];
};

const yen = (n: number) => `¥${n.toLocaleString()}`;

export default function UberPage() {
  const [d, setD] = useState<Summary | null>(null);
  const [err, setErr] = useState("");
  const [importMsg, setImportMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/uber");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "取得失敗");
      setD(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 取り込み口。Uber Eats Manager のタブから開かれたときだけ動く
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("import") || !window.opener) return;
    setImportMsg("Uber Eats Manager からの注文を待っています…");
    const onMsg = async (e: MessageEvent) => {
      if (e.origin !== UBER_ORIGIN || e.data?.type !== "flat-uber-data") return;
      const raw = Array.isArray(e.data.raw) ? e.data.raw : [];
      try {
        const res = await fetch("/api/uber", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "保存に失敗");
        setImportMsg(`✅ ${j.received}件を取り込みました（新しい注文 ${j.added}件・合計 ${j.total}件）`);
        (e.source as Window | null)?.postMessage({ type: "flat-uber-result", ok: true, ...j }, UBER_ORIGIN);
        load();
      } catch (er) {
        const msg = er instanceof Error ? er.message : "保存に失敗";
        setImportMsg(`取り込みに失敗：${msg}`);
        (e.source as Window | null)?.postMessage({ type: "flat-uber-result", ok: false, error: msg }, UBER_ORIGIN);
      }
    };
    window.addEventListener("message", onMsg);
    window.opener.postMessage({ type: "flat-uber-ready" }, UBER_ORIGIN);
    return () => window.removeEventListener("message", onMsg);
  }, [load]);

  const maxWeek = Math.max(1, ...(d?.byWeek ?? []).map((w) => w.subtotal));

  return (
    <div className="wrap">
      <header>
        <h1>🛵 Uber Eats</h1>
        <p>Squareに入らない、Uberの注文</p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}
      {importMsg && (
        <div className="card" style={{ padding: "12px 14px", fontWeight: 700 }}>{importMsg}</div>
      )}

      {d && (
        <div className="card total-card">
          <div className="total-label">取り込んだ注文（{d.weeks}週分）</div>
          <div className="total-amount">{yen(d.subtotal)}</div>
          <div style={{ marginTop: 6, fontSize: 12.5, opacity: 0.85 }}>
            {d.count}件 ／ 受取 {yen(d.net)}
            {d.canceled > 0 && ` ／ キャンセル・不成立 ${d.canceled}件`}
            {d.lastImportedOrder && ` ／ 最新 ${d.lastImportedOrder.replace("T", " ").slice(5)}`}
          </div>
        </div>
      )}

      {d && d.count === 0 && (
        <div className="card" style={{ padding: 14, fontSize: 13 }}>
          まだ取り込んでいません。毎週月曜の朝に、Uber Eats Manager から自動で取り込みます。
        </div>
      )}

      {d && d.count > 0 && (
        <>
          <div className="card" style={{ padding: "12px 14px" }}>
            <div className="cat-title">週ごと（月曜はじまり）</div>
            {d.byWeek.map((w) => (
              <div key={w.monday} style={{ display: "grid", gridTemplateColumns: "64px 1fr 92px", gap: 8, alignItems: "center", padding: "5px 0", fontSize: 13 }}>
                <span className="mono">{w.monday.slice(5).replace("-", "/")}〜</span>
                <div style={{ background: "#eef1f4", borderRadius: 4, height: 10 }}>
                  <div style={{ width: `${(w.subtotal / maxWeek) * 100}%`, background: "var(--accent)", height: 10, borderRadius: 4 }} />
                </div>
                <span style={{ textAlign: "right" }}>{yen(w.subtotal)}・{w.count}件</span>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: "12px 14px" }}>
            <div className="cat-title">ホットサンド（曜日ごと・1週あたり）</div>
            <p className="hint" style={{ margin: "2px 0 6px" }}>
              セットの中で選ばれたものも数えています。店内（Square）の分は入っていません。
            </p>
            {d.hotsandPerWeek.filter((h) => h.weekday !== "火").map((h) => (
              <div key={h.weekday} className="result-row" style={{ fontSize: 13 }}>
                <span>{h.weekday}曜</span>
                <span>クラシック {h.classic} ／ ガーデン {h.garden}</span>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: "12px 14px" }}>
            <div className="cat-title">商品ごとの数</div>
            {d.byItem.map((it) => (
              <div key={it.name} className="result-row" style={{ fontSize: 13 }}>
                <span>{it.name}</span>
                <span>{it.qty}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
