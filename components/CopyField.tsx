"use client";

import { useState } from "react";

export default function CopyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // クリップボード不可の環境では選択して手動コピー
    }
  }
  return (
    <div className="cf">
      <span className="cf-label">{label}</span>
      <span className="cf-value">{value || "—"}</span>
      {hint && <span className="cf-hint">{hint}</span>}
      <button className="cf-btn" onClick={copy} type="button">
        {copied ? "✓ コピー済" : "コピー"}
      </button>
    </div>
  );
}
