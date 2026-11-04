"use client";

import { useState } from "react";
import { UNKNOWN_ITEM } from "@/lib/keiri/itemTotals";
import type { ItemView } from "@/lib/keiri/types";
import { md, yen } from "./format";

// 月次ページの「品目で見る」。その月の費用を品目ごとの合計で並べ、押すと買った日と店を出す
export default function ItemTotals({ data }: { data: ItemView }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="card">
      <div className="it-head">
        <h2>品目ごとの支出</h2>
        <span className="it-sum">合計 {yen(data.total)}</span>
      </div>
      <p className="hint">店舗・イベントの区別なく、この月の費用を全部出しています。消費税の行は、同じレシートの品目に割り振っています。</p>
      {data.unknownCount > 0 && (
        <p className="it-warn">中身が未登録の支出が {data.unknownCount}件 {yen(data.unknownTotal)} あります。領収書や注文履歴が見つかると品目に振り分けられます。</p>
      )}
      {data.rows.length === 0 && <p className="hint">この月の支出はありません。</p>}
      <ul className="it-list">
        {data.rows.map((r) => (
          <li key={r.item}>
            <button
              type="button"
              className={`it-item ${r.item === UNKNOWN_ITEM ? "unknown" : ""}`}
              onClick={() => setOpen(open === r.item ? null : r.item)}
              aria-expanded={open === r.item}
            >
              <span className="it-name">{open === r.item ? "▾" : "▸"} {r.item}</span>
              <span className="it-count">{r.count}件</span>
              <span className="it-amt">{yen(r.total)}</span>
            </button>
            {open === r.item && (
              <ul className="it-buys">
                {r.buys.map((b, i) => (
                  <li key={`${b.sourceType}${b.sourceId}-${i}`}>
                    <span className="it-date">{md(b.date)}</span>
                    <span className="it-vendor">{b.vendor || "（店名なし）"}</span>
                    <span className="it-desc">{b.name || "（摘要なし）"}</span>
                    <span className="it-amt">{yen(b.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <style jsx>{`
        .it-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
        h2 { font-size: 17px; margin: 0; }
        .it-sum { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .it-warn { margin: 8px 0 0; padding: 8px 10px; border-radius: 8px; background: #fdf0e6; color: #7a4a14; font-size: 13px; }
        .it-list, .it-buys { list-style: none; margin: 0; padding: 0; }
        .it-list { margin-top: 10px; }
        .it-list > li { border-top: 1px solid var(--line); }
        .it-item { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: baseline; gap: 12px; width: 100%; padding: 10px 0; }
        .it-item:hover .it-name { color: var(--accent); }
        .it-item:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px; }
        .it-item.unknown .it-name { color: #9c5f22; font-weight: 700; }
        .it-name { flex: 1; min-width: 0; font-weight: 500; overflow-wrap: anywhere; }
        .it-count { flex: none; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
        .it-amt { flex: none; min-width: 76px; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .it-buys { padding: 0 0 10px 18px; }
        .it-buys li { display: flex; align-items: baseline; gap: 10px; padding: 3px 0; font-size: 12px; color: var(--muted); }
        .it-date { flex: none; width: 40px; font-variant-numeric: tabular-nums; }
        .it-vendor { flex: 0 1 180px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .it-desc { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @media (max-width: 640px) {
          .it-buys li { flex-wrap: wrap; }
          .it-vendor { flex: 1 1 auto; }
          .it-desc { flex-basis: 100%; order: 3; white-space: normal; padding-left: 50px; }
        }
      `}</style>
    </section>
  );
}
