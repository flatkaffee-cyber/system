"use client";

// 画面の一部を、書式（表・太字）ごとコピーするボタン。Googleドキュメントやメールに貼ると表のまま入る。
// 2026-11-09 坂本さん「売上計画がPDFでしか出力できないから、Googleドキュメントに貼れない」

import { useState, type RefObject } from "react";

export default function CopyRich({ target, label = "📋 コピー（Googleドキュメントに貼る）" }: { target: RefObject<HTMLElement | null>; label?: string }) {
  const [msg, setMsg] = useState("");
  const copy = async () => {
    const el = target.current;
    if (!el) return;
    setMsg("");
    try {
      // 書式つきで入れる（貼る先で表になる）
      const html = `<meta charset="utf-8">${el.outerHTML}`;
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([el.innerText], { type: "text/plain" }),
        }),
      ]);
      setMsg("コピーしました。Googleドキュメントに貼り付けてください");
    } catch {
      // 書式つきのコピーができないブラウザは、選んで「コピー」する
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNode(el);
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.execCommand("copy");
        sel?.removeAllRanges();
        setMsg("コピーしました。Googleドキュメントに貼り付けてください");
      } catch {
        setMsg("コピーできませんでした。表を選んで ⌘C でコピーしてください");
      }
    }
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button
        onClick={copy}
        style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #c9b8a6", background: "#fff", color: "#23201c", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
      >
        {label}
      </button>
      {msg && <span style={{ fontSize: 13, color: "#5f5950" }}>{msg}</span>}
    </span>
  );
}
