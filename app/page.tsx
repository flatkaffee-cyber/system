"use client";

import { useRef, useState } from "react";
import { CATEGORIES, type Receipt } from "@/lib/receipt";
import Nav from "@/components/Nav";
import ReceiptChat from "@/components/ReceiptChat";
import CopyField from "@/components/CopyField";

const MEMBERS = ["坂本", "町田", "櫻井", "國仲"] as const;

type Status = "idle" | "extracting" | "review" | "saved";

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Receipt & { payer: string; memo: string }>({
    date: "",
    vendor: "",
    total: 0,
    category: "不明",
    summary: "",
    confidence: "medium",
    payer: MEMBERS[0],
    memo: "",
  });
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    setImage(dataUrl);
    setStatus("extracting");

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "抽出に失敗しました。");
      const r = json.receipt as Receipt;
      setForm((f) => ({ ...f, ...r }));
      setStatus("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "抽出に失敗しました。");
      setStatus("idle");
    }
  }

  function reset() {
    setStatus("idle");
    setImage(null);
    setError(null);
  }

  return (
    <div className="wrap">
      <header>
        <h1>☕ flat. 立替精算</h1>
        <p>領収書を撮ってアップ → AIが日付・金額・科目を自動判定します</p>
      </header>
      <Nav />

      {status === "idle" && (
        <>
          <div
            className={`drop ${over ? "over" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
          >
            <strong>領収書をアップロード</strong>
            <small>タップして選択 / ドラッグ＆ドロップ（png・jpeg・webp）</small>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {error && <p className="err">{error}</p>}
        </>
      )}

      {status === "extracting" && (
        <div className="card" style={{ textAlign: "center" }}>
          {image && <img src={image} alt="領収書" className="preview" />}
          <p style={{ marginTop: 16, color: "var(--muted)" }}>
            <span
              className="spinner"
              style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }}
            />
            AIが読み取り中…
          </p>
        </div>
      )}

      {status === "review" && (
        <div className="card">
          {image && <img src={image} alt="領収書" className="preview" />}
          <p style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
            AIの読み取り結果
            <span className={`badge ${form.confidence}`}>
              自信度 {form.confidence}
            </span>
          </p>
          <p className="hint">内容を確認・修正してから登録してください。</p>

          <label>日付</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />

          <label>店名・支払先</label>
          <input
            value={form.vendor}
            onChange={(e) => setForm({ ...form, vendor: e.target.value })}
          />

          <label>内容</label>
          <input
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />

          <div className="row">
            <div>
              <label>金額（税込・円）</label>
              <input
                type="number"
                value={form.total}
                onChange={(e) =>
                  setForm({ ...form, total: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label>立替えた人</label>
              <select
                value={form.payer}
                onChange={(e) => setForm({ ...form, payer: e.target.value })}
              >
                {MEMBERS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label>科目（freee連携時に使用）</label>
          <select
            value={form.category}
            onChange={(e) =>
              setForm({ ...form, category: e.target.value as Receipt["category"] })
            }
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <label>メモ（なぜ払ったか・freeeの備考になります）</label>
          <textarea
            rows={2}
            value={form.memo}
            placeholder="例：オープン準備の打合せ交通費／来客用のコーヒー豆 など"
            onChange={(e) => setForm({ ...form, memo: e.target.value })}
          />

          <ReceiptChat
            date={form.date}
            vendor={form.vendor}
            total={form.total}
            summary={form.summary}
            category={form.category}
            payer={form.payer}
            onApplyCategory={(c) => setForm({ ...form, category: c })}
          />

          <div style={{ marginTop: 18 }}>
            <button
              className="primary"
              onClick={() => setStatus("saved")}
              disabled={!form.date || !form.total}
            >
              この内容で登録（Phase 2 で freee へ）
            </button>
            <button className="ghost" onClick={reset}>
              ← やり直す
            </button>
          </div>
        </div>
      )}

      {status === "saved" && (
        <div className="card">
          <div className="saved">✅ 読み取り＆確認 OK（立替）</div>
          <div className="freee-panel" style={{ marginTop: 12 }}>
            <div className="freee-panel-title">
              📋 freee登録用（立替＝借)科目／貸)役員借入金）
            </div>
            <CopyField label="発生日" value={form.date} />
            <CopyField label="取引先" value={form.payer} hint="立替えた人" />
            <CopyField label="勘定科目" value={form.category} />
            <CopyField label="金額" value={String(form.total)} />
            {form.memo ? <CopyField label="備考" value={form.memo} /> : null}
            <div className="freee-note">
              貸方は「役員借入金（取引先＝{form.payer}）」。取引先を付けると「払うもの」タブに反映されます。
            </div>
          </div>
          <button className="primary" onClick={reset} style={{ marginTop: 12 }}>
            次の領収書を登録
          </button>
        </div>
      )}
    </div>
  );
}
