"use client";

import type { Scope, Scopes } from "@/lib/keiri/buckets";
import { signedYen, yen } from "./format";

// 月次の上の4つのカード。店舗・イベント・臨時・全体。月次レポートと同じ数字。
// 選んでいる範囲（全体なら「全体の結果」）を太い枠にする。
export default function ScopeCards({ scopes, advanceIn, scope }: { scopes: Scopes; advanceIn: number; scope: Scope }) {
  const cards = [
    { key: "store", label: "店舗（通常営業）", value: scopes.store, on: scope === "store" },
    { key: "event", label: "イベント", value: scopes.event, on: scope === "event" },
    { key: "irregular", label: "臨時（一度きりの収入・支出）", value: scopes.irregular, on: false, sub: advanceIn ? `クラファンなどの入金 ${signedYen(advanceIn)} を含む` : "" },
    { key: "total", label: "全体の結果", value: scopes.total, on: scope === "all" },
  ];
  return (
    <section className="sc-cards" aria-label="この月の結果">
      {cards.map((c) => (
        <div key={c.key} className={`sc-card ${c.on ? "sc-on" : ""}`}>
          <span className="sc-cap">{c.label}</span>
          <b className={c.value > 0 ? "sc-plus" : c.value < 0 ? "sc-minus" : ""}>{c.key === "total" ? yen(c.value) : signedYen(c.value)}</b>
          {c.sub && <span className="sc-sub">{c.sub}</span>}
        </div>
      ))}
      <style jsx>{`
        .sc-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 14px; }
        .sc-card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
        .sc-card.sc-on { border: 2px solid var(--ink); padding: 11px 13px; }
        .sc-cap { font-size: 12px; color: var(--muted); }
        .sc-card b { font-size: 20px; font-variant-numeric: tabular-nums; }
        .sc-plus { color: var(--ok, #2e7d32); }
        .sc-minus { color: #c62828; }
        .sc-sub { font-size: 11px; color: var(--muted); }
        @media print { .sc-card { border-color: #999; } }
      `}</style>
    </section>
  );
}
