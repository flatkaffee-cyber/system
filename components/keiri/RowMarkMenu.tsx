"use client";

import { useEffect, useRef, useState } from "react";
import { MARK_COLORS, NOTE_MAX, type RowMark } from "@/lib/keiri/notes";

type Props = {
  title: string; // どの行か（相手と金額）
  mark?: RowMark;
  at: { x: number; y: number }; // 画面上の位置（右クリックした場所、またはメモのセルの下）
  onSave: (input: { color: string; note: string }) => Promise<void>; // 失敗したら throw する
  onClose: () => void;
};

const WIDTH = 280;
const HEIGHT = 270;

// 行の色とメモを付ける小さなメニュー。保存に失敗したら開いたまま「保存できませんでした」と出す。
export default function RowMarkMenu({ title, mark, at, onSave, onClose }: Props) {
  const [color, setColor] = useState<string>(mark?.color ?? "");
  const [note, setNote] = useState(mark?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    noteRef.current?.focus();
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

  // 画面の外にはみ出さないようにずらす
  const left = Math.max(8, Math.min(at.x, window.innerWidth - WIDTH - 8));
  const top = Math.max(8, Math.min(at.y, window.innerHeight - HEIGHT - 8));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave({ color, note });
    } catch {
      setError("保存できませんでした");
      setSaving(false);
    }
  };

  return (
    <div ref={box} className="menu" role="dialog" aria-label={`${title} の色とメモ`} style={{ left, top }}>
      <div className="ttl">{title}</div>
      <div className="colors" role="radiogroup" aria-label="色">
        <button type="button" role="radio" aria-checked={color === ""} className={`sw none ${color === "" ? "on" : ""}`} onClick={() => setColor("")}>
          なし
        </button>
        {MARK_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={color === c.key}
            className={`sw ${color === c.key ? "on" : ""}`}
            style={{ background: c.bg }}
            onClick={() => setColor(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <textarea
        ref={noteRef}
        value={note}
        maxLength={NOTE_MAX}
        rows={3}
        aria-label="メモ"
        placeholder="メモ（例: 返品予定。10月に返金）"
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <p className="err" role="alert">{error}</p>}
      <div className="btns">
        <button type="button" onClick={onClose}>閉じる</button>
        <button type="button" className="ok" onClick={save} disabled={saving}>{saving ? "保存中…" : "保存"}</button>
      </div>

      <style jsx>{`
        .menu {
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
        .ttl { font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .colors { display: flex; flex-wrap: wrap; gap: 6px; }
        .sw { min-width: 36px; height: 30px; border: 1px solid var(--line); border-radius: 8px; font-size: 12px; cursor: pointer; color: var(--ink); background: var(--card); }
        .sw.on { outline: 2px solid var(--ink); outline-offset: 1px; font-weight: 700; }
        .sw:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
        textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--line); border-radius: 8px; padding: 8px; font: inherit; font-size: 13px; resize: vertical; }
        textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
        .err { margin: 0; color: #c62828; font-size: 12px; }
        .btns { display: flex; justify-content: flex-end; gap: 8px; }
        .btns button { border: 1px solid var(--line); background: var(--card); border-radius: 8px; padding: 6px 12px; cursor: pointer; font: inherit; font-size: 13px; }
        .btns .ok { background: var(--ink); border-color: var(--ink); color: #fff; font-weight: 700; }
        .btns .ok:disabled { opacity: 0.6; cursor: default; }
        .btns button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      `}</style>
    </div>
  );
}
