"use client";

import { useEffect, useRef, useState } from "react";
import Nav from "@/components/Nav";

type Doc = {
  id: string;
  fileName: string;
  type: string;
  title: string;
  date: string;
  summary: string;
  payments: { payee: string; amount: number; note: string }[];
  taxReview: boolean;
  uploadedAt: string;
};

export default function Shorui() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    fetch("/api/docs")
      .then((r) => r.json())
      .then((j) => setDocs(j.docs ?? []))
      .catch(() => setDocs([]));
  }
  useEffect(load, []);

  async function onFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: dataUrl, fileName: file.name }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "アップロード失敗");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="wrap">
      <header>
        <h1>📄 書類の保管庫</h1>
        <p>請求書・契約書・明細書を貯めておくと、口座明細と自動で照合します</p>
      </header>
      <Nav />

      <div className="card">
        <button
          className="primary"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <><span className="spinner" />読み取り中…</> : "＋ 書類をアップ（PDF・画像）"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <p className="hint">
          アップすると内容をAIが読み取り、支払先・金額・想定仕訳を抽出して保管します。あとで該当の口座明細が出たら「この書類の支払いでは？」と提案します。
        </p>
        {error && <p className="err">{error}</p>}
      </div>

      {docs === null && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          <span className="spinner" style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }} />
          読み込み中…
        </div>
      )}

      {docs && docs.length === 0 && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          まだ書類がありません。請求書や契約書をアップしてみてください。
        </div>
      )}

      {docs &&
        docs.map((d) => (
          <div key={d.id} className="card doc-card">
            <div className="doc-card-head">
              <div>
                <span className="doc-type">{d.type}</span>
                <span className="doc-title">{d.title}</span>
              </div>
              <div className="doc-date">{d.date}</div>
            </div>
            <div className="doc-summary">{d.summary}</div>
            {d.payments.length > 0 && (
              <div className="doc-pays">
                {d.payments.map((p, i) => (
                  <div key={i} className="doc-pay">
                    <span>{p.payee}｜{p.note}</span>
                    <span>¥{p.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
            {d.taxReview && <div className="doc-tax">🧑‍💼 税理士論点あり</div>}
          </div>
        ))}
    </div>
  );
}
