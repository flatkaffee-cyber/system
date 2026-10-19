"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { KeiriMonthlyResponse } from "@/app/api/keiri/monthly/route";
import KeiriSheet from "./KeiriSheet";
import PlTable from "./PlTable";
import { monthLabel, yen } from "./format";
import { isMonth, jstMonth } from "@/lib/keiri/period";
import { buildSheet, clearsOnLoad, monthTabs, NO_FILTER, type SheetFilter, type SheetRow } from "@/lib/keiri/sheet";
import RowMarkMenu from "./RowMarkMenu";
import MemoBoard from "./MemoBoard";
import SyncBar from "./SyncBar";
import ScopeCards from "./ScopeCards";
import BucketMenu from "./BucketMenu";
import ScopePl from "./ScopePl";
import { isScope, SCOPE_BUCKET, type Bucket, type Scope } from "@/lib/keiri/buckets";
import type { RowMarks } from "@/lib/keiri/notes";

// 月次ページ。上から 月のタブ → 数字のカード → 道具の帯 → 表（経理で見る）または損益計算書（会計で見る）。
export default function KeiriMonthly() {
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("month") ?? "";
  const thisMonth = jstMonth();
  const month = isMonth(raw) ? raw : thisMonth;
  const view = sp.get("view") === "pl" ? "pl" : "cash";
  const rawScope = sp.get("scope") ?? "all";
  const scope: Scope = isScope(rawScope) ? rawScope : "all";
  const [data, setData] = useState<KeiriMonthlyResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SheetFilter>(NO_FILTER);
  const [marks, setMarks] = useState<RowMarks>({});
  const [marksError, setMarksError] = useState("");
  const [menu, setMenu] = useState<{ row: SheetRow; at: { x: number; y: number } } | null>(null);
  const [reloadKey, setReloadKey] = useState(0); // 「今すぐ取り込む」・区分の付け替えのあとに読み直す
  const [bucketMenu, setBucketMenu] = useState<{ row: SheetRow; at: { x: number; y: number } } | null>(null);

  const go = useCallback(
    (m: string, v: string, sc: Scope = scope) => router.push(`/keiri?month=${m}&view=${v}&scope=${sc}`),
    [router, scope],
  );

  const loadedFor = useRef<{ month: string; view: string } | null>(null);
  useEffect(() => {
    let alive = true;
    setError("");
    // 前の月の数字が残らないように、月か見方が変わったときだけ空にする。付け替えのあとの読み直しは前の表のまま差し替える
    if (clearsOnLoad(loadedFor.current, { month, view })) {
      setLoading(true);
      setData(null);
    }
    loadedFor.current = { month, view };
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
  }, [month, view, reloadKey]);

  // 行の色とメモは月の数字の読み込みを待たずに取る
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
  // 「店舗だけ」「イベント」のときは、その区分の行だけを表に出す
  const scoped = useMemo(() => {
    if (!data?.cash) return null;
    const b = SCOPE_BUCKET[scope];
    if (!b || !data.rowBuckets) return data.cash;
    const keep = (r: { key: string }) => data.rowBuckets?.[r.key] === b;
    return { ...data.cash, inflows: data.cash.inflows.filter(keep), outflows: data.cash.outflows.filter(keep) };
  }, [data, scope]);
  const sheet = useMemo(() => (scoped ? buildSheet(scoped, filter, notes) : null), [scoped, filter, notes]);

  const closeBucketMenu = useCallback(() => setBucketMenu(null), []);
  // 区分の付け替え。取引の行なら月次レポートと同じ鍵に入るので、カードの数字も動く。終わったら読み直す
  const saveBucket = useCallback(
    async (row: SheetRow, bucket: Bucket | null) => {
      const keys = data?.rowOverrideKeys?.[row.key];
      if (!keys?.length) throw new Error("付け替えの鍵がありません");
      const r = await fetch("/api/keiri/bucket", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys, bucket }),
      });
      if (!r.ok) throw new Error("保存できませんでした");
      setBucketMenu(null);
      setReloadKey((k) => k + 1);
    },
    [data],
  );
  const t = data?.cash?.totals;

  return (
    <main className="wide">
      <div className="head">
        <h1>{monthLabel(month)}の月次</h1>
        <div className="views scope" role="tablist" aria-label="範囲">
          {(["all", "store", "event"] as const).map((sc) => (
            <button key={sc} type="button" role="tab" aria-selected={scope === sc} className={scope === sc ? "on" : ""} onClick={() => go(month, view, sc)}>
              {sc === "all" ? "全体" : sc === "store" ? "店舗だけ" : "イベント"}
            </button>
          ))}
        </div>
      </div>
      <SyncBar onSynced={() => setReloadKey((k) => k + 1)} />

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
      {loading && !error && <p className="hint">読み込んでいます…</p>}
      {!loading && data?.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
      {marksError && <p className="warn">{marksError}</p>}
      {!loading && (data?.future || data?.noData) && <section className="card"><p>まだデータがありません。</p></section>}

      {data?.scopes && <ScopeCards scopes={data.scopes} advanceIn={data.advanceIn ?? 0} scope={scope} />}

      {!data?.future && <MemoBoard month={month} />}

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
            {t && (
              <span className="counts">
                領収書なし <b className={t.missingReceipts ? "r" : ""}>{t.missingReceipts}件</b>
                ・未処理 <b className={t.unprocessed ? "r" : ""}>{t.unprocessed}件</b>
              </span>
            )}
            <button type="button" className="print" onClick={() => window.print()}>🖨 印刷（A4横）</button>
          </>
        )}
        <div className="views" role="tablist" aria-label="見方">
          <button type="button" role="tab" aria-selected={view === "cash"} className={view === "cash" ? "on" : ""} onClick={() => go(month, "cash")}>経理で見る</button>
          <button type="button" role="tab" aria-selected={view === "pl"} className={view === "pl" ? "on" : ""} onClick={() => go(month, "pl")}>会計で見る</button>
        </div>
      </div>

      {!loading && view === "cash" && scope === "event" && (
        <p className="hint">イベントのレジ売上は Square の入金に含まれるため、この表では店舗に入っています。イベントの数字は上のカードで見てください。</p>
      )}
      {!loading && view === "cash" && sheet && (
        <KeiriSheet
          sheet={sheet}
          marks={marks}
          onOpenMark={(row, at) => setMenu({ row, at })}
          buckets={data?.rowBuckets}
          onOpenBucket={(row, at) => setBucketMenu({ row, at })}
        />
      )}
      {bucketMenu && data?.rowBuckets?.[bucketMenu.row.key] && (
        <BucketMenu
          key={bucketMenu.row.key}
          title={`${bucketMenu.row.partner ?? bucketMenu.row.title}　${yen(bucketMenu.row.amount)}`}
          bucket={data.rowBuckets[bucketMenu.row.key]}
          auto={data.rowAuto?.[bucketMenu.row.key] ?? true}
          otherMonth={data.rowOtherMonth?.[bucketMenu.row.key]}
          at={bucketMenu.at}
          onSave={(b) => saveBucket(bucketMenu.row, b)}
          onClose={closeBucketMenu}
        />
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
      {!loading && view === "pl" && scope === "all" && data?.pl && (
        <PlTable
          data={data.pl}
          extra={data.plScope && data.scopes ? { estimatesTotal: data.plScope.estimatesTotal, advanceTotal: data.plScope.advanceTotal, total: data.scopes.total } : undefined}
        />
      )}
      {!loading && view === "pl" && scope !== "all" && data?.plScope && <ScopePl scope={scope} plScope={data.plScope} />}

      <style jsx>{`
        main.wide { max-width: none; padding: 20px 24px 64px; }
        h1 { font-size: 22px; margin: 0; }
        .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
        .views.scope { margin-left: 0; }
        .counts { font-size: 13px; color: var(--muted); }
        .counts b { color: var(--ink); font-variant-numeric: tabular-nums; }
        .counts b.r { color: #c62828; }
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
          .months, .tools, .warn, .views.scope { display: none; }
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
