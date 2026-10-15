"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { KeiriMonthlyResponse } from "@/app/api/keiri/monthly/route";
import CashTable from "./CashTable";
import PlTable from "./PlTable";
import { monthLabel } from "./format";
import { isMonth, jstMonth, shiftMonth } from "@/lib/keiri/period";

export default function KeiriMonthly() {
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("month") ?? "";
  const thisMonth = jstMonth();
  const month = isMonth(raw) ? raw : thisMonth;
  const prev = shiftMonth(month, -1);
  const next = month < thisMonth ? shiftMonth(month, 1) : null;
  const view = sp.get("view") === "pl" ? "pl" : "cash";
  const [data, setData] = useState<KeiriMonthlyResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const go = useCallback(
    (m: string, v: string) => router.push(`/keiri?month=${m}&view=${v}`),
    [router],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setData(null); // 前の月の数字が残らないように
    fetch(`/api/keiri/monthly?month=${encodeURIComponent(month)}&view=${view}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) setError(j.error || "読み込みに失敗しました");
        else setData(j as KeiriMonthlyResponse);
      })
      .catch(() => alive && setError("読み込みに失敗しました"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [month, view]);

  return (
    <main>
      <div className="head">
        <div className="months">
          <button type="button" onClick={() => go(prev, view)} aria-label="前の月">‹</button>
          <h1>{monthLabel(month)}</h1>
          <button type="button" disabled={!next} onClick={() => next && go(next, view)} aria-label="次の月">›</button>
        </div>
        <div className="views" role="tablist" aria-label="見方">
          <button type="button" role="tab" aria-selected={view === "cash"} className={view === "cash" ? "on" : ""} onClick={() => go(month, "cash")}>経理で見る</button>
          <button type="button" role="tab" aria-selected={view === "pl"} className={view === "pl" ? "on" : ""} onClick={() => go(month, "pl")}>会計で見る</button>
        </div>
      </div>

      {error && (
        <section className="card">
          <p>{error}</p>
          {error.includes("未接続") && <a href="/api/freee/authorize">freeeに接続する</a>}
        </section>
      )}
      {loading && !error && <p className="hint">freeeから読み込んでいます…</p>}
      {!loading && data?.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
      {!loading && (data?.future || data?.noData) && <section className="card"><p>まだデータがありません。</p></section>}
      {!loading && data?.cash && view === "cash" && <CashTable data={data.cash} />}
      {!loading && data?.pl && view === "pl" && <PlTable data={data.pl} />}

      <style jsx>{`
        .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
        .months { display: flex; align-items: center; gap: 8px; }
        .months h1 { margin: 0; font-size: 22px; min-width: 140px; text-align: center; font-variant-numeric: tabular-nums; }
        .months button { width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); font-size: 18px; cursor: pointer; color: var(--ink); }
        .months button:disabled { opacity: 0.35; cursor: default; }
        .months button:focus-visible, .views button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .views { display: inline-flex; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
        .views button { border: 0; background: var(--card); padding: 8px 14px; font-weight: 700; color: var(--muted); cursor: pointer; }
        .views button.on { background: var(--ink); color: #fff; }
        .warn { background: #fff4e5; color: #8a5300; border-radius: 10px; padding: 8px 12px; font-size: 13px; }
      `}</style>
    </main>
  );
}
