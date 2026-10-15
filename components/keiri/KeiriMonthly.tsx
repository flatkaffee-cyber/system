"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { KeiriMonthlyResponse } from "@/app/api/keiri/monthly/route";
import KeiriSheet from "./KeiriSheet";
import PlTable from "./PlTable";
import { monthLabel, yen } from "./format";
import { isMonth, jstMonth } from "@/lib/keiri/period";
import { buildSheet, monthTabs, NO_FILTER, type SheetFilter, type SheetRow } from "@/lib/keiri/sheet";
import RowMarkMenu from "./RowMarkMenu";
import type { RowMarks } from "@/lib/keiri/notes";

// 月次ページ。上から 月のタブ → 数字のカード → 道具の帯 → 表（経理で見る）または損益計算書（会計で見る）。
export default function KeiriMonthly() {
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("month") ?? "";
  const thisMonth = jstMonth();
  const month = isMonth(raw) ? raw : thisMonth;
  const view = sp.get("view") === "pl" ? "pl" : "cash";
  const [data, setData] = useState<KeiriMonthlyResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SheetFilter>(NO_FILTER);
  const [marks, setMarks] = useState<RowMarks>({});
  const [marksError, setMarksError] = useState("");
  const [menu, setMenu] = useState<{ row: SheetRow; at: { x: number; y: number } } | null>(null);

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

  // 行の色とメモは freee の読み込みを待たずに取る
  useEffect(() => {
    let alive = true;
    setMarks({});
    setMarksError("");
    setMenu(null);
    fetch(`/api/keiri/marks?month=${encodeURIComponent(month)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) setMarksError("メモと色を読み込めませんでした");
        else setMarks(j.marks as RowMarks);
      })
      .catch(() => alive && setMarksError("メモと色を読み込めませんでした"));
    return () => { alive = false; };
  }, [month]);

  const closeMenu = useCallback(() => setMenu(null), []);

  // 保存できたら画面の色とメモを保存後のものにする。失敗したら throw してメニューに出す（画面の色とメモは変えない）
  const saveMark = useCallback(
    async (key: string, input: { color: string; note: string }) => {
      const r = await fetch("/api/keiri/marks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, key, ...input }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "保存できませんでした");
      setMarks(j.marks as RowMarks);
      setMenu(null);
    },
    [month],
  );

  const notes = useMemo(
    () => Object.fromEntries(Object.entries(marks).map(([k, m]) => [k, m.note ?? ""])),
    [marks],
  );
  const sheet = useMemo(() => (data?.cash ? buildSheet(data.cash, filter, notes) : null), [data, filter, notes]);
  const t = data?.cash?.totals;

  return (
    <main className="wide">
      <h1>{monthLabel(month)}の月次</h1>

      <div className="months" role="tablist" aria-label="月">
        {monthTabs(thisMonth).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={m === month}
            className={m === month ? "on" : ""}
            onClick={() => go(m, view)}
          >
            {Number(m.slice(5, 7))}月{m === thisMonth ? " *" : ""}
          </button>
        ))}
      </div>

      {error && (
        <section className="card">
          <p>{error}</p>
          {error.includes("未接続") && <a href="/api/freee/authorize">freeeに接続する</a>}
        </section>
      )}
      {loading && !error && <p className="hint">freeeから読み込んでいます…</p>}
      {!loading && data?.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
      {marksError && <p className="warn">{marksError}</p>}
      {!loading && (data?.future || data?.noData) && <section className="card"><p>まだデータがありません。</p></section>}

      {t && (
        <section className="kpis" aria-label="この月の数字">
          <div><span className="cap">入金</span><b>{yen(t.in)}</b></div>
          <div><span className="cap">出金</span><b>{yen(t.out)}</b></div>
          <div><span className="cap">差引</span><b className={t.net >= 0 ? "g" : "r"}>{yen(t.net)}</b></div>
          <div><span className="cap">領収書なし</span><b className={t.missingReceipts ? "r" : ""}>{t.missingReceipts}件</b></div>
          <div><span className="cap">未処理</span><b className={t.unprocessed ? "r" : ""}>{t.unprocessed}件</b></div>
        </section>
      )}

      <div className="tools">
        {view === "cash" && (
          <>
            <input
              type="search"
              className="q"
              placeholder="相手・科目・摘要・メモで絞り込み"
              aria-label="絞り込み"
              value={filter.query}
              onChange={(e) => setFilter({ ...filter, query: e.target.value })}
            />
            <label>
              <input type="checkbox" checked={filter.missingOnly} onChange={(e) => setFilter({ ...filter, missingOnly: e.target.checked })} />
              領収書なしだけ
            </label>
            <label>
              <input type="checkbox" checked={filter.todoOnly} onChange={(e) => setFilter({ ...filter, todoOnly: e.target.checked })} />
              未処理だけ
            </label>
            <button type="button" className="print" onClick={() => window.print()}>🖨 印刷（A4横）</button>
          </>
        )}
        <div className="views" role="tablist" aria-label="見方">
          <button type="button" role="tab" aria-selected={view === "cash"} className={view === "cash" ? "on" : ""} onClick={() => go(month, "cash")}>経理で見る</button>
          <button type="button" role="tab" aria-selected={view === "pl"} className={view === "pl" ? "on" : ""} onClick={() => go(month, "pl")}>会計で見る</button>
        </div>
      </div>

      {!loading && view === "cash" && sheet && (
        <KeiriSheet sheet={sheet} marks={marks} onOpenMark={(row, at) => setMenu({ row, at })} />
      )}
      {menu && (
        <RowMarkMenu
          key={menu.row.key}
          title={`${menu.row.partner ?? menu.row.title}　${yen(menu.row.amount)}`}
          mark={marks[menu.row.key]}
          at={menu.at}
          onSave={(input) => saveMark(menu.row.key, input)}
          onClose={closeMenu}
        />
      )}
      {!loading && view === "pl" && data?.pl && <PlTable data={data.pl} />}

      <style jsx>{`
        main.wide { max-width: none; padding: 20px 24px 64px; }
        h1 { font-size: 22px; margin: 0 0 12px; }
        .months { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
        .months button {
          border: 1px solid var(--line);
          background: var(--card);
          color: var(--ink);
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 14px;
          cursor: pointer;
          font-variant-numeric: tabular-nums;
        }
        .months button.on { background: var(--ink); border-color: var(--ink); color: #fff; font-weight: 700; }
        .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 14px; }
        .kpis div { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
        .cap { font-size: 12px; color: var(--muted); }
        .kpis b { font-size: 20px; font-variant-numeric: tabular-nums; }
        .g { color: var(--ok, #2e7d32); }
        .r { color: #c62828; }
        .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-bottom: 10px; }
        .q { flex: 1 1 220px; max-width: 320px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); font: inherit; font-size: 14px; }
        .tools label { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; cursor: pointer; }
        .print { border: 1px solid var(--line); background: var(--card); border-radius: 8px; padding: 7px 12px; cursor: pointer; font: inherit; font-size: 13px; }
        .views { margin-left: auto; display: inline-flex; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
        .views button { border: 0; background: var(--card); padding: 8px 14px; font-weight: 700; color: var(--muted); cursor: pointer; }
        .views button.on { background: var(--ink); color: #fff; }
        .months button:focus-visible, .views button:focus-visible, .print:focus-visible, .q:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .warn { background: #fff4e5; color: #8a5300; border-radius: 10px; padding: 8px 12px; font-size: 13px; }
        @media (max-width: 899px) {
          main.wide { padding: 14px 12px 64px; }
          .views { margin-left: 0; }
        }
        @media print {
          main.wide { padding: 0; }
          .months, .tools, .warn { display: none; }
          .kpis div { border-color: #999; }
        }
      `}</style>
      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
    </main>
  );
}
