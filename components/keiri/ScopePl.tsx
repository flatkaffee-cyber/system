"use client";

import type { KeiriMonthlyResponse } from "@/app/api/keiri/monthly/route";
import { signedYen, yen } from "./format";

type PlScope = NonNullable<KeiriMonthlyResponse["plScope"]>;

// 「会計で見る」の店舗だけ・イベント。月次レポートと同じ数え方（見込みの費用を含む）。
export default function ScopePl({ scope, plScope }: { scope: "store" | "event"; plScope: PlScope }) {
  if (scope === "event") {
    const total = plScope.event.reduce((s, x) => s + x.amount, 0);
    return (
      <section className="card">
        <h2 className="spl-h">イベント</h2>
        <p className="spl-hint">{plScope.eventLabels.length ? plScope.eventLabels.join("・") : "この月はイベントがありません。"}</p>
        <table className="spl">
          <tbody>
            {plScope.event.map((x) => (
              <tr key={x.account}><th>{x.account}</th><td>{signedYen(x.amount)}</td></tr>
            ))}
            <tr className="spl-total"><th>イベントの結果</th><td className={total < 0 ? "spl-minus" : ""}>{signedYen(total)}</td></tr>
          </tbody>
        </table>
        <Style />
      </section>
    );
  }
  const r = plScope.store;
  return (
    <section className="card">
      <h2 className="spl-h">店舗（通常営業）</h2>
      <table className="spl">
        <tbody>
          <tr className="spl-sub"><th>売上</th><td>{yen(r.sales)}</td></tr>
          {r.salesBy.map((x) => (
            <tr key={x.label} className="spl-part"><th>{x.label}</th><td>{yen(x.amount)}</td></tr>
          ))}
          <tr><th>原価（仕入）<span className="spl-note">原価率 {r.cogsRate}%</span></th><td>{yen(-r.cogs)}</td></tr>
          {r.expenses.map((x) => (
            <tr key={x.account} className="spl-part"><th>{x.account}</th><td>{yen(-x.amount)}</td></tr>
          ))}
          <tr className="spl-sub"><th>人件費を払う前</th><td className={r.beforeLabor < 0 ? "spl-minus" : ""}>{yen(r.beforeLabor)}</td></tr>
          {r.labor.map((x) => (
            <tr key={x.label} className="spl-part"><th>{x.label}</th><td>{yen(-x.amount)}</td></tr>
          ))}
          <tr className="spl-total"><th>店舗の結果</th><td className={r.profit < 0 ? "spl-minus" : ""}>{yen(r.profit)}</td></tr>
        </tbody>
      </table>
      <p className="spl-hint">「（見込み・freee未計上）」の行は、毎月かかるのにまだ freee に入っていない費用です。</p>
      <Style />
    </section>
  );
}

function Style() {
  return (
    <style jsx global>{`
      .spl-h { font-size: 16px; margin: 0 0 6px; }
      .spl-hint { font-size: 12px; color: var(--muted); margin: 6px 0; }
      .spl { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
      .spl th { text-align: left; font-weight: 500; padding: 7px 0; }
      .spl td { text-align: right; padding: 7px 0; white-space: nowrap; }
      .spl tr { border-top: 1px solid var(--line); }
      .spl tr.spl-part th { padding-left: 18px; font-size: 13px; color: var(--muted); }
      .spl tr.spl-part td { font-size: 13px; color: var(--muted); }
      .spl tr.spl-sub th, .spl tr.spl-sub td { font-weight: 700; }
      .spl tr.spl-total th, .spl tr.spl-total td { font-weight: 800; font-size: 17px; border-top: 2px solid var(--ink); }
      .spl-note { margin-left: 8px; font-size: 12px; color: var(--muted); font-weight: 400; }
      .spl-minus { color: #c62828; }
    `}</style>
  );
}
