"use client";

import { useCallback, useEffect, useState } from "react";
import type { KeiriSyncStatus } from "@/app/api/keiri/sync/route";
import { stamp } from "@/lib/freeeMirror/health";

// freee → Supabase の取り込みの状態。「最終取り込み」と「今すぐ取り込む」、取り込めていないときの黄色い帯。
// Supabase をまだ使っていない（configured=false）あいだは何も出さない（画面は freee から直接出ている）。
export default function SyncBar({ onSynced }: { onSynced?: () => void }) {
  const [s, setS] = useState<KeiriSyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/keiri/sync", { cache: "no-store" });
      if (r.ok) setS((await r.json()) as KeiriSyncStatus);
    } catch {
      // 状態が読めなくても画面の数字は出ているので、帯を出さないだけにする
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  async function run() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/keiri/sync", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (j.status) setS(j.status as KeiriSyncStatus);
      if (j.busy) setMsg("ほかの取り込みが動いています。少しあとで開き直してください");
      else if (!r.ok || j.ok === false) setMsg(`取り込めませんでした: ${String(j.error ?? "").slice(0, 120)}`);
      else onSynced?.();
    } catch {
      setMsg("取り込めませんでした。通信を確かめてください");
    } finally {
      setBusy(false);
    }
  }

  if (!s?.configured) return null;
  const last = s.lastSuccessAt ? stamp(s.lastSuccessAt) : null;

  return (
    <div className="sb-wrap">
      <div className="sb-row">
        <span className="sb-time">{last ? `最終取り込み ${last}` : "まだ取り込んでいません"}</span>
        <button type="button" className="sb-go" onClick={run} disabled={busy}>
          {busy ? "取り込み中…" : "今すぐ取り込む"}
        </button>
        {msg && (
          <span className="sb-msg" role="status">
            {msg}
          </span>
        )}
      </div>
      {s.stale && (
        <p className="sb-alert">
          freee から取り込めていません（最終 {last ?? "なし"}）。表示しているのは最後に取り込んだ数字です。
          {s.reconnect && (
            <>
              {" "}
              <a href="/api/freee/authorize">freee に接続する</a>
            </>
          )}
        </p>
      )}
      <style jsx>{`
        .sb-wrap { margin: -4px 0 14px; display: flex; flex-direction: column; gap: 8px; }
        .sb-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
        .sb-time { font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
        .sb-go {
          border: 1px solid var(--line);
          background: var(--card);
          color: var(--ink);
          border-radius: 8px;
          padding: 5px 10px;
          font: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .sb-go:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .sb-go:disabled { cursor: progress; color: var(--muted); }
        .sb-go:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .sb-msg { font-size: 13px; color: #8a5300; }
        .sb-alert { margin: 0; background: #fff4e5; color: #8a5300; border-radius: 10px; padding: 8px 12px; font-size: 13px; }
        .sb-alert a { color: inherit; font-weight: 700; text-underline-offset: 3px; }
        .sb-alert a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
        @media print { .sb-wrap { display: none; } }
      `}</style>
    </div>
  );
}
