"use client";

import { Fragment, useState } from "react";
import type { PlLine, PlView } from "@/lib/keiri/types";
import { md, yen } from "./format";

function Accounts({ line }: { line: PlLine }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!line.accounts?.length) return <p className="hint">この月の動きはありません。</p>;
  return (
    <ul className="accts">
      {line.accounts.map((a) => (
        <li key={a.name}>
          <button type="button" className="acct" onClick={() => setOpen(open === a.name ? null : a.name)} aria-expanded={open === a.name}>
            <span>{a.entries.length ? (open === a.name ? "▾" : "▸") : "・"} {a.name}</span>
            <span className="amt">{yen(a.amount)}</span>
          </button>
          {open === a.name && (
            <ul className="entries">
              {a.entries.map((e, i) => (
                <li key={`${e.sourceType}${e.sourceId}-${i}`}>
                  <span className="date">{md(e.date)}</span>
                  <span className="desc">{e.description || "（摘要なし）"}</span>
                  <span className="amt">{yen(e.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function PlTable({ data }: { data: PlView }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="card">
      <table className="pl">
        <tbody>
          {data.lines.map((l) => (
            <Fragment key={l.key}>
              <tr className={l.kind}>
                <th>
                  {l.accounts ? (
                    <button type="button" className="toggle" onClick={() => setOpen(open === l.key ? null : l.key)} aria-expanded={open === l.key}>
                      {open === l.key ? "▾" : "▸"} {l.label}
                    </button>
                  ) : l.label}
                </th>
                <td className={l.kind !== "item" && l.amount < 0 ? "r" : ""}>{yen(l.amount)}</td>
              </tr>
              {l.key === "sga" && (
                <>
                  <tr className="part"><th>うち 役員報酬</th><td>{yen(data.officerPay)}</td></tr>
                  <tr className="part"><th>うち 人件費（給料手当・雑給・法定福利費）</th><td>{yen(data.laborCost)}</td></tr>
                </>
              )}
              {open === l.key && (
                <tr className="open"><td colSpan={2}><Accounts line={l} /></td></tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {data.tax.estimated && (
        <p className="hint">法人税等は見込みです（税引前利益がプラスなら×25%、毎月 均等割 ¥5,833）。決算で確定します。</p>
      )}
      <style jsx>{`
        .pl { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
        .pl th { text-align: left; font-weight: 500; padding: 8px 0; }
        .pl td { text-align: right; padding: 8px 0; white-space: nowrap; }
        .pl tr { border-top: 1px solid var(--line); }
        .pl tr.item th { padding-left: 16px; }
        .pl tr.subtotal th, .pl tr.subtotal td { font-weight: 700; }
        .pl tr.total th, .pl tr.total td { font-weight: 800; font-size: 17px; border-top: 2px solid var(--ink); }
        .pl tr.part th { padding-left: 36px; font-size: 13px; color: var(--muted); }
        .pl tr.part td { font-size: 13px; color: var(--muted); }
        .pl tr.open td { text-align: left; padding: 4px 0 10px 16px; }
        .r { color: #c62828; }
        .toggle { all: unset; cursor: pointer; border-radius: 6px; }
        .toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        :global(.accts), :global(.entries) { list-style: none; margin: 0; padding: 0; }
        :global(.accts .acct) { all: unset; cursor: pointer; display: flex; justify-content: space-between; width: 100%; box-sizing: border-box; padding: 5px 0; font-size: 14px; border-radius: 6px; }
        :global(.accts .acct:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
        :global(.accts .amt), :global(.entries .amt) { font-variant-numeric: tabular-nums; }
        :global(.entries) { padding-left: 18px; }
        :global(.entries li) { display: flex; gap: 8px; font-size: 12px; color: var(--muted); padding: 3px 0; }
        :global(.entries .date) { width: 40px; flex: none; }
        :global(.entries .desc) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      `}</style>
    </section>
  );
}
