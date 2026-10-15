"use client";

import { useCallback, useEffect, useState } from "react";
import { MEMO_MAX, type KeiriMemo } from "@/lib/keiri/notes";
import { monthLabel } from "./format";

// 経理メモ（申し送り）。書いた月から、済みにするまで次の月以降にも出る（決まりは lib/keiri/notes.ts）。
export default function MemoBoard({ month }: { month: string }) {
  const [memos, setMemos] = useState<KeiriMemo[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /** API を呼び、返ってきた「その月に出すメモ」で一覧を置き換える。成功したら true */
  const call = useCallback(async (init: RequestInit, query: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/keiri/memos${query}`, {
        ...init,
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "経理メモを読み書きできませんでした");
      setMemos(j.memos as KeiriMemo[]);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "経理メモを読み書きできませんでした");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    setMemos([]);
    void call({ method: "GET" }, `?month=${month}`);
  }, [month, call]);

  const add = async () => {
    if (await call({ method: "POST", body: JSON.stringify({ month, text }) }, "")) setText("");
  };
  const toggle = (m: KeiriMemo) => call({ method: "PATCH", body: JSON.stringify({ month, id: m.id, done: !m.done }) }, "");
  const remove = (m: KeiriMemo) => {
    if (window.confirm("このメモを消しますか？")) void call({ method: "DELETE" }, `?month=${month}&id=${encodeURIComponent(m.id)}`);
  };

  return (
    <section className="memo" aria-label="経理メモ">
      <div className="head">
        <b>経理メモ</b>
        <span>{monthLabel(month)}分の申し送り。済みにするまで、次の月にも出ます</span>
      </div>
      <div className="add">
        <textarea
          value={text}
          maxLength={MEMO_MAX}
          rows={2}
          aria-label="経理メモを書く"
          placeholder="例）8/19のAmazonは2回払い。領収書は1枚で、もう片方は記録済み"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="button" onClick={add} disabled={busy || !text.trim()}>追加</button>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      {memos.length === 0 ? (
        <p className="empty">まだメモはありません</p>
      ) : (
        <ul>
          {memos.map((m) => (
            <li key={m.id} className={m.done ? "done" : ""}>
              {m.month !== month && <span className="from">{Number(m.month.slice(5, 7))}月から</span>}
              <span className="text">{m.text}</span>
              <button type="button" onClick={() => toggle(m)} disabled={busy}>{m.done ? "戻す" : "済み"}</button>
              <button type="button" className="del" onClick={() => remove(m)} disabled={busy}>消す</button>
            </li>
          ))}
        </ul>
      )}

      <style jsx>{`
        .memo { background: #fff8e6; border: 1px solid #f0d9a8; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; }
        .head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin-bottom: 8px; }
        .head b { color: #8a5300; }
        .head span { font-size: 12px; color: #a0782e; }
        .add { display: flex; gap: 8px; align-items: stretch; }
        textarea { flex: 1; border: 1px solid #f0d9a8; border-radius: 8px; padding: 8px; font: inherit; font-size: 13px; resize: vertical; background: #fffdf7; }
        textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
        .add button { border: 0; border-radius: 8px; padding: 0 16px; background: var(--accent); color: #fff; font-weight: 700; cursor: pointer; }
        .add button:disabled { opacity: 0.5; cursor: default; }
        .err { color: #c62828; font-size: 12px; margin: 6px 0 0; }
        .empty { margin: 8px 0 0; font-size: 12px; color: #a0782e; }
        ul { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 4px; }
        li { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
        li.done .text { text-decoration: line-through; color: var(--muted); }
        .from { font-size: 11px; color: #a0782e; white-space: nowrap; }
        .text { flex: 1; white-space: pre-wrap; }
        li button { border: 1px solid #f0d9a8; background: #fffdf7; border-radius: 6px; padding: 2px 8px; font-size: 12px; cursor: pointer; }
        li button:disabled { opacity: 0.5; cursor: default; }
        li .del { color: #c62828; }
        button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        @media print {
          .add, li button, .err { display: none; }
          .memo { background: none; }
        }
      `}</style>
    </section>
  );
}
