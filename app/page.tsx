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
  const [saving, setSaving] = useState(false);
  const [dup, setDup] = useState<
    { vendor: string; date: string; total: number; registered: boolean } | null
  >(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          vendor: form.vendor,
          total: form.total,
          category: form.category,
          summary: form.summary,
          payer: form.payer,
          memo: form.memo,
          image, // 原本画像も保存（消えないように）
        }),
      });
    } catch {
      // 保存に失敗しても確認内容は表示する
    }
    setSaving(false);
    setStatus("saved");
  }

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
      // 重複チェック：同じ日付・金額の領収書が既に保存済みなら警告
      setDup(null);
      try {
        const saved = await fetch("/api/receipts").then((x) => x.json());
        const hit = (saved.receipts ?? []).find(
          (x: { date: string; total: number }) => x.date === r.date && x.total === r.total,
        );
        if (hit) {
          setDup({
            vendor: hit.vendor,
            date: hit.date,
            total: hit.total,
            registered: !!hit.registered,
          });
        }
      } catch {
        // 重複チェック失敗は無視（登録は継続可）
      }
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
    setDup(null);
  }

  const isPdf = image?.startsWith("data:application/pdf") ?? false;

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
            <small>タップして選択 / ドラッグ＆ドロップ（png・jpeg・webp・PDF）</small>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {error && <p className="err">{error}</p>}
          <a
            href="/receipts"
            className="rc-toggle"
            style={{ display: "block", textAlign: "center", marginTop: 12, textDecoration: "none" }}
          >
            📥 保存済み領収書を見る・freeeに登録する →
          </a>
        </>
      )}

      {status === "extracting" && (
        <div className="card" style={{ textAlign: "center" }}>
          {image &&
            (isPdf ? (
              <div className="preview pdf-preview">📄 PDF を読み取ります</div>
            ) : (
              <img src={image} alt="領収書" className="preview" />
            ))}
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
          {image &&
            (isPdf ? (
              <div className="preview pdf-preview">📄 PDF を読み取ります</div>
            ) : (
              <img src={image} alt="領収書" className="preview" />
            ))}
          <p style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
            AIの読み取り結果
            <span className={`badge ${form.confidence}`}>
              自信度 {form.confidence}
            </span>
          </p>
          <p className="hint">内容を確認・修正してから登録してください。</p>

          {dup && (
            <div className="dup-warn">
              ⚠️ <strong>同じ日付・金額の領収書が既にあります</strong>
              <div>
                （{dup.date}／{dup.vendor || "店名なし"}／¥{dup.total.toLocaleString()}／
                {dup.registered ? "freee登録済" : "保存済・未登録"}）
              </div>
              <div style={{ marginTop: 4 }}>二重計上に注意。別物なら日付・金額を確認してから登録してください。</div>
            </div>
          )}

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
              onClick={save}
              disabled={!form.date || !form.total || saving}
            >
              {saving ? <span className="spinner" /> : "この内容で登録（保存＋freee貼付用を表示）"}
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
