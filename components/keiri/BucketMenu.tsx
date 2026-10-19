"use client";

import { useEffect, useRef, useState } from "react";
import type { Bucket } from "@/lib/keiri/buckets";
import { BUCKET_LABEL } from "./format";

type Props = {
  title: string; // どの行か（相手と金額）
  bucket: Bucket;
  auto: boolean; // 付け替えていない（自動のまま）
  otherMonth?: string; // 取引の計上が別の月なら、その月（YYYY-MM）
  at: { x: number; y: number };
  onSave: (bucket: Bucket | null) => Promise<void>; // null は自動に戻す。失敗したら throw する
  onClose: () => void;
};

const WIDTH = 260;
const HEIGHT = 210;
const ORDER: Bucket[] = ["regular", "event", "irregular"];

// 行の区分（店舗・イベント・臨時）を付け替える小さなメニュー。押したらすぐ保存する。
export default function BucketMenu({ title, bucket, auto, otherMonth, at, onSave, onClose }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>("button[aria-checked='true']")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const left = Math.max(8, Math.min(at.x, window.innerWidth - WIDTH - 8));
  const top = Math.max(8, Math.min(at.y, window.innerHeight - HEIGHT - 8));

  const save = async (b: Bucket | null) => {
    setSaving(true);
    setError("");
    try {
      await onSave(b);
    } catch {
      setError("保存できませんでした");
      setSaving(false);
    }
  };

  return (
    <div ref={box} className="bk-menu" role="dialog" aria-label={`${title} の区分`} style={{ left, top }}>
      <div className="bk-ttl">{title}</div>
      <div className="bk-opts" role="radiogroup" aria-label="区分">
        {ORDER.map((b) => (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={b === bucket}
            className={`bk-opt bk-${b} ${b === bucket ? "bk-cur" : ""}`}
            disabled={saving}
            onClick={() => save(b)}
          >
            {BUCKET_LABEL[b]}
          </button>
        ))}
      </div>
      {otherMonth && (
        <p className="bk-note">この取引は{Number(otherMonth.slice(5, 7))}月の計上なので、{Number(otherMonth.slice(5, 7))}月の数字が変わります。</p>
      )}
      {error && <p className="bk-err" role="alert">{error}</p>}
      <div className="bk-btns">
        <button type="button" onClick={() => save(null)} disabled={saving || auto}>自動に戻す</button>
        <button type="button" onClick={onClose}>閉じる</button>
      </div>
      <style jsx>{`
        .bk-menu {
          position: fixed;
          z-index: 960;
          width: ${WIDTH}px;
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .bk-ttl { font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bk-opts { display: flex; gap: 6px; }
        .bk-opt { flex: 1; height: 34px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--ink); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; padding: 0; }
        .bk-opt.bk-cur { outline: 2px solid var(--ink); outline-offset: 1px; }
        .bk-opt.bk-regular { background: #e8f1fb; color: #1f5f8b; }
        .bk-opt.bk-event { background: #fdf0e6; color: #9c5f22; }
        .bk-opt.bk-irregular { background: #efe8f7; color: #5b3d8a; }
        .bk-opt:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
        .bk-opt:disabled { cursor: progress; opacity: 0.7; }
        .bk-note { margin: 0; font-size: 12px; color: var(--muted); }
        .bk-err { margin: 0; color: #c62828; font-size: 12px; }
        .bk-btns { display: flex; justify-content: flex-end; gap: 8px; }
        .bk-btns button { border: 1px solid var(--line); background: var(--card); border-radius: 8px; padding: 6px 12px; cursor: pointer; font: inherit; font-size: 13px; color: var(--ink); }
        .bk-btns button:disabled { opacity: 0.5; cursor: default; }
        .bk-btns button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      `}</style>
    </div>
  );
}
