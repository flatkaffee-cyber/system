"use client";

import { Fragment, useState } from "react";
import type { Sheet, SheetRow } from "@/lib/keiri/sheet";
import { MARK_COLORS, type RowMarks } from "@/lib/keiri/notes";
import { freeeLinks } from "@/lib/keiri/nav";
import ReceiptPreview from "./ReceiptPreview";
import { md, yen } from "./format";

const STATUS_LABEL = { done: "✓", todo: "未処理", waiting: "消込待ち" } as const;
const MARK_BG: Record<string, string> = Object.fromEntries(MARK_COLORS.map((c) => [c.key, c.bg]));

function ReceiptCell({ row, onOpen }: { row: SheetRow; onOpen: () => void }) {
  switch (row.receiptStatus) {
    case "attached":
      return (
        <button type="button" className="rc ok" onClick={(e) => { e.stopPropagation(); onOpen(); }} aria-label="領収書を開く">
          🧾
        </button>
      );
    case "amazon":
      return (
        <a
          className="rc ok"
          target="_blank"
          rel="noreferrer"
          href={`https://www.amazon.co.jp/gp/your-account/order-details?orderID=${row.amazonOrderId}`}
          onClick={(e) => e.stopPropagation()}
        >
          📦 注文
        </a>
      );
    case "missing-recorded":
      return <span className="rc warn">⚠ なし（記録済み）</span>;
    case "missing":
      return <span className="rc bad">⚠ なし</span>;
    default:
      return null;
  }
}

type Props = {
  sheet: Sheet;
  marks: RowMarks;
  onOpenMark: (row: SheetRow, at: { x: number; y: number }) => void;
};

// 月次の「経理で見る」の表。1行＝1件の入出金。区切りごとに小計、最後に合計（移動は除く）。
// 行を押すと、すぐ下に明細の原文・freeeのリンク・領収書の画像を開く。右クリックかメモのセルで、色とメモを付ける。
export default function KeiriSheet({ sheet, marks, onOpenMark }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = (key: string) => setOpenKey(openKey === key ? null : key);

  if (sheet.sections.length === 0) return <p className="hint">条件に合う行はありません。</p>;

  return (
    <div className="sheet-wrap">
      <table className="sheet">
        <thead>
          <tr>
            <th className="c-date">日付</th>
            <th className="c-who">相手</th>
            <th className="c-acct">科目</th>
            <th className="c-desc">摘要</th>
            <th className="c-amt">入金</th>
            <th className="c-amt">出金</th>
            <th className="c-rc">領収書</th>
            <th className="c-st">freee</th>
            <th className="c-memo">メモ</th>
          </tr>
        </thead>
        <tbody>
          {sheet.sections.map((sec) => (
            <Fragment key={sec.key}>
              <tr className={`sec sec-${sec.key}`}>
                <th colSpan={4} scope="rowgroup">
                  <span className="bar" aria-hidden="true" />
                  {sec.label}
                  <span className="count">{sec.rows.length}件</span>
                  {sec.key === "move" && <span className="note">口座⇄現金の移動。合計に入れない</span>}
                </th>
                <td className="c-amt">{sec.inSum ? yen(sec.inSum) : ""}</td>
                <td className="c-amt">{sec.outSum ? yen(sec.outSum) : ""}</td>
                <td colSpan={3} />
              </tr>
              {sec.rows.map((r) => (
                <Fragment key={r.key}>
                  <tr
                    className={`row ${r.kind === "move" ? "move" : ""} ${r.status !== "done" ? "todo" : ""}`}
                    style={marks[r.key]?.color ? { background: MARK_BG[marks[r.key].color ?? ""] } : undefined}
                    onClick={() => toggle(r.key)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onOpenMark(r, { x: e.clientX, y: e.clientY });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(r.key);
                      }
                    }}
                    tabIndex={0}
                    aria-expanded={openKey === r.key}
                  >
                    <td className="c-date">{md(r.date)}</td>
                    <td className="c-who" title={r.partner ?? r.title}>{r.partner ?? r.title}</td>
                    <td className="c-acct">{r.account}</td>
                    <td className="c-desc">{r.description}</td>
                    <td className="c-amt">{r.side === "in" ? yen(r.amount) : ""}</td>
                    <td className="c-amt">{r.side === "out" ? yen(r.amount) : ""}</td>
                    <td className="c-rc"><ReceiptCell row={r} onOpen={() => setOpenKey(r.key)} /></td>
                    <td className={`c-st st-${r.status}`}>{STATUS_LABEL[r.status]}</td>
                    <td className="c-memo">
                      <button
                        type="button"
                        className={`memo-btn ${marks[r.key]?.note ? "has" : ""}`}
                        aria-label={`${r.partner ?? r.title} の色とメモ`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          onOpenMark(r, { x: rect.left, y: rect.bottom + 4 });
                        }}
                      >
                        {marks[r.key]?.note || "＋"}
                      </button>
                    </td>
                  </tr>
                  {openKey === r.key && (
                    <tr className="detail">
                      <td colSpan={9}>
                        <div>元の文字: {r.title}</div>
                        <div className="links">
                          {freeeLinks(r).map((l) => (
                            <a key={l.href} href={l.href} target="_blank" rel="noreferrer">{l.label}</a>
                          ))}
                        </div>
                        {r.receipt && <ReceiptPreview id={r.receipt.id} title={r.receipt.vendor} />}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="total">
            <th colSpan={4} scope="row">
              合計（移動を除く）<span className="net">差引 {yen(sheet.totals.net)}</span>
            </th>
            <td className="c-amt">{yen(sheet.totals.in)}</td>
            <td className="c-amt">{yen(sheet.totals.out)}</td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>

      <style jsx>{`
        .sheet-wrap { background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
        .sheet { width: 100%; min-width: 880px; border-collapse: separate; border-spacing: 0; font-size: 13px; }
        th, td { padding: 6px 10px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; vertical-align: top; }
        thead th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: #f1efea;
          color: var(--muted);
          font-size: 12px;
          font-weight: 700;
        }
        thead th:first-child { border-top-left-radius: 12px; }
        thead th:last-child { border-top-right-radius: 12px; }
        .c-amt { text-align: right; font-variant-numeric: tabular-nums; }
        .c-date { width: 52px; color: var(--muted); font-variant-numeric: tabular-nums; }
        .c-who { max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
        .c-desc { white-space: normal; min-width: 200px; }
        .c-st { width: 64px; }
        .c-memo { min-width: 120px; max-width: 260px; white-space: normal; }
        .memo-btn { border: 0; background: none; padding: 0; font: inherit; font-size: 12px; text-align: left; cursor: pointer; color: var(--muted); }
        .memo-btn.has { color: var(--ink); }
        .memo-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

        .sec th, .sec td { font-weight: 700; border-bottom-color: transparent; }
        .sec .bar { display: inline-block; width: 4px; height: 14px; border-radius: 2px; margin-right: 8px; vertical-align: -2px; }
        .sec .count { margin-left: 8px; font-weight: 400; font-size: 12px; color: var(--muted); }
        .sec .note { margin-left: 8px; font-weight: 400; font-size: 11px; color: var(--muted); }
        .sec-in th, .sec-in td { background: #eaf4ea; } .sec-in .bar { background: #2e7d32; }
        .sec-card th, .sec-card td { background: var(--accent-weak); } .sec-card .bar { background: var(--accent); }
        .sec-bank th, .sec-bank td { background: #e8eef7; } .sec-bank .bar { background: #2f5d9b; }
        .sec-cash th, .sec-cash td { background: #e3f2ef; } .sec-cash .bar { background: #00796b; }
        .sec-tatekae th, .sec-tatekae td { background: #f6e8f3; } .sec-tatekae .bar { background: #8e3a7d; }
        .sec-move th, .sec-move td { background: #efede8; } .sec-move .bar { background: #7a756c; }

        .row { cursor: pointer; }
        .row:hover td { background: #faf8f4; }
        .row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
        .row.move td { color: var(--muted); }
        .row.todo .c-who { color: #c62828; }
        .st-done { color: var(--ok, #2e7d32); }
        .st-todo { color: #c62828; font-weight: 700; }
        .st-waiting { color: #8a5300; font-weight: 700; }

        .rc { border: 0; background: none; padding: 0; font: inherit; cursor: pointer; text-decoration: none; }
        .rc.ok { color: var(--accent); }
        .rc.warn { color: #8a5300; cursor: default; }
        .rc.bad { color: #c62828; cursor: default; }
        .rc:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

        .detail td { background: #fbfaf7; white-space: normal; font-size: 12px; color: var(--muted); }
        .links { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 4px; }
        .links a { color: var(--accent); }

        .total th, .total td { font-weight: 800; border-top: 2px solid var(--ink); border-bottom: 0; }
        .net { margin-left: 16px; font-variant-numeric: tabular-nums; }

        @media (max-width: 899px) {
          .sheet-wrap { overflow-x: auto; }
        }
        @media print {
          .sheet-wrap { border: 0; }
          .sheet { min-width: 0; font-size: 10px; }
          thead th { position: static; }
          .detail { display: none; }
          .row:hover td { background: none; }
          tr { break-inside: avoid; }
          .sec th, .sec td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .row { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .memo-btn:not(.has) { visibility: hidden; }
        }
      `}</style>
    </div>
  );
}
