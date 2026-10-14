"use client";

import { useState } from "react";
import type { CashRow, CashView } from "@/lib/keiri/types";
import ReceiptPreview from "./ReceiptPreview";
import { md, TAG_LABEL, yen } from "./format";
import { inflowLabel } from "@/lib/keiri/nav";

function ReceiptCell({ row, open, onToggle }: { row: CashRow; open: boolean; onToggle: () => void }) {
  switch (row.receiptStatus) {
    case "attached":
      return (
        <button type="button" className="rc ok" onClick={onToggle} aria-expanded={open}>
          🧾 領収書{open ? "を閉じる" : ""}
        </button>
      );
    case "amazon":
      return (
        <a className="rc ok" target="_blank" rel="noreferrer"
          href={`https://www.amazon.co.jp/gp/your-account/order-details?orderID=${row.amazonOrderId}`}>
          📦 注文を見る
        </a>
      );
    case "missing-recorded":
      return <span className="rc warn">⚠ 領収書なし（記録済み）</span>;
    case "missing":
      return <span className="rc bad">⚠ 領収書なし</span>;
    default:
      return null;
  }
}

function Rows({ rows, out }: { rows: CashRow[]; out: boolean }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [receiptKey, setReceiptKey] = useState<string | null>(null);
  if (rows.length === 0) return <p className="hint">この月はありません。</p>;
  return (
    <ul className="rows">
      {rows.map((r) => (
        <li key={r.key} className={`${r.kind === "move" ? "move" : ""} ${r.processed ? "" : "todo"}`}>
          <button type="button" className="line" onClick={() => setOpenKey(openKey === r.key ? null : r.key)} aria-expanded={openKey === r.key}>
            <span className="date">{md(r.date)}</span>
            {out && r.tag && <span className={`tag ${r.tag}`}>{TAG_LABEL[r.tag]}</span>}
            {!out && <span className={`tag in-${r.kind}`}>{inflowLabel(r.kind)}</span>}
            <span className="title">{r.partner ?? r.title}</span>
            <span className="amt">{yen(r.amount)}</span>
          </button>
          <div className="sub">
            <span className="detail">{r.detail}{!r.processed && "（未処理）"}</span>
            {out && (
              <ReceiptCell
                row={r}
                open={receiptKey === r.key}
                onToggle={() => setReceiptKey(receiptKey === r.key ? null : r.key)}
              />
            )}
          </div>
          {receiptKey === r.key && r.receipt && <ReceiptPreview id={r.receipt.id} title={r.receipt.vendor} />}
          {openKey === r.key && (
            <div className="more">
              <div>明細: {r.title}</div>
              {r.dealId && <div>freee 取引ID: {r.dealId}</div>}
              {r.journalId && <div>freee 振替伝票ID: {r.journalId}</div>}
              {r.walletTxnId && (
                <a target="_blank" rel="noreferrer" href={`https://secure.freee.co.jp/wallet_txns/stream/${r.walletTxnId}`}>
                  freeeで明細を開く
                </a>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function CashTable({ data }: { data: CashView }) {
  const t = data.totals;
  return (
    <>
      <section className="card kpis">
        <div><span className="cap">入金</span><b>{yen(t.in)}</b></div>
        <div><span className="cap">出金</span><b>{yen(t.out)}</b></div>
        <div><span className="cap">差引</span><b className={t.net >= 0 ? "g" : "r"}>{yen(t.net)}</b></div>
        <div><span className="cap">領収書なし</span><b className={t.missingReceipts ? "r" : ""}>{t.missingReceipts}件</b></div>
        <div><span className="cap">未処理</span><b className={t.unprocessed ? "r" : ""}>{t.unprocessed}件</b></div>
      </section>

      <section className="card">
        <h2>入ってきたお金</h2>
        <Rows rows={data.inflows} out={false} />
      </section>

      <section className="card">
        <h2>出ていったお金</h2>
        <Rows rows={data.outflows} out />
      </section>

      <style jsx>{`
        .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 12px; }
        .kpis div { display: flex; flex-direction: column; gap: 2px; }
        .cap { font-size: 12px; color: var(--muted); }
        .kpis b { font-size: 18px; font-variant-numeric: tabular-nums; }
        .g { color: var(--ok, #2e7d32); }
        .r { color: #c62828; }
        h2 { font-size: 15px; margin: 0 0 10px; }
        :global(.rows) { list-style: none; margin: 0; padding: 0; }
        :global(.rows li) { border-top: 1px solid var(--line); padding: 8px 0; }
        :global(.rows li.move) { opacity: 0.55; }
        :global(.rows li.todo .title) { color: #c62828; }
        :global(.rows .line) { all: unset; cursor: pointer; display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box; border-radius: 6px; }
        :global(.rows .line:focus-visible), :global(.rows .rc:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
        :global(.rows .date) { width: 44px; flex: none; color: var(--muted); font-variant-numeric: tabular-nums; font-size: 13px; }
        :global(.rows .title) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        :global(.rows .amt) { font-variant-numeric: tabular-nums; font-weight: 700; }
        :global(.rows .tag) { font-size: 11px; padding: 2px 6px; border-radius: 6px; background: var(--accent-weak); color: var(--accent); white-space: nowrap; }
        :global(.rows .tag.bank) { background: #e8eef7; color: #2f5d9b; }
        :global(.rows .tag.cash) { background: #e8f3e9; color: #2e7d32; }
        :global(.rows .tag.tatekae) { background: #f6e8f3; color: #8e3a7d; }
        :global(.rows .tag.in-sales) { background: #e8f3e9; color: #2e7d32; }
        :global(.rows .tag.in-other) { background: #efede8; color: var(--muted); }
        :global(.rows .tag.in-move) { background: #efede8; color: var(--muted); }
        :global(.rows .sub) { display: flex; justify-content: space-between; gap: 8px; padding-left: 52px; font-size: 12px; color: var(--muted); }
        :global(.rows .detail) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        :global(.rows .rc) { white-space: nowrap; font-size: 12px; border: 0; background: none; padding: 0; cursor: pointer; text-decoration: none; font: inherit; }
        :global(.rows .rc.ok) { color: var(--accent); }
        :global(.rows .rc.warn) { color: #8a5300; cursor: default; }
        :global(.rows .rc.bad) { color: #c62828; cursor: default; }
        :global(.rows .more) { padding: 6px 0 0 52px; font-size: 12px; color: var(--muted); display: grid; gap: 2px; }
        :global(.rows .more a) { color: var(--accent); }
      `}</style>
    </>
  );
}
