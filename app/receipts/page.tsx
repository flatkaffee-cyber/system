"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";

type Receipt = {
  id: string;
  date: string;
  vendor: string;
  total: number;
  category: string;
  summary: string;
  payer: string;
  memo: string;
  savedAt: string;
  registered?: { journalId: number; at: string };
};

export default function Receipts() {
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    fetch("/api/receipts")
      .then((r) => r.json())
      .then((j) => setReceipts(j.receipts ?? []))
      .catch(() => setReceipts([]));
  }
  useEffect(load, []);

  async function register(id: string) {
    setBusy(id);
    setMsg(null);
    try {
      const res = await fetch("/api/receipts/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "登録に失敗");
      setReceipts((rs) =>
        rs
          ? rs.map((r) =>
              r.id === id
                ? { ...r, registered: { journalId: j.journalId, at: new Date().toISOString() } }
                : r,
            )
          : rs,
      );
      setMsg(j.already ? "すでに登録済みでした" : "freeeに登録しました ✓");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  const unreg = receipts?.filter((r) => !r.registered).length ?? 0;

  return (
    <div className="wrap">
      <header>
        <h1>📥 保存済み領収書</h1>
        <p>アップした立替領収書。freeeに登録（借)科目／貸)役員借入金）できます</p>
      </header>
      <Nav />

      {msg && <p className="hint" style={{ textAlign: "center" }}>{msg}</p>}

      {receipts === null && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          <span className="spinner" style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }} />
          読み込み中…
        </div>
      )}

      {receipts && receipts.length === 0 && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          まだ保存された領収書はありません。「🧾領収書」タブからアップしてください。
        </div>
      )}

      {receipts && receipts.length > 0 && (
        <div className="connected-note">
          未登録 {unreg} 件 ／ 全 {receipts.length} 件
        </div>
      )}

      {receipts?.map((r) => (
        <div key={r.id} className={`card meisai ${r.registered ? "done" : ""}`}>
          <div className="meisai-head" style={{ cursor: "default" }}>
            <div>
              <div className="meisai-desc">{r.vendor || "（店名なし）"}</div>
              <div className="meisai-sub">
                {r.date}・{r.category}・立替: {r.payer}
              </div>
              {r.memo && <div className="meisai-sub">📝 {r.memo}</div>}
            </div>
            <div className="meisai-right">
              <div className="meisai-amt out">¥{r.total.toLocaleString()}</div>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            {r.registered ? (
              <div className="decided-box" style={{ margin: 0 }}>
                ✓ freee登録済（振替伝票 #{r.registered.journalId}）／ 借)
                {r.category}・貸)役員借入金（{r.payer}）
              </div>
            ) : (
              <button
                className="pay-btn"
                style={{ width: "100%" }}
                onClick={() => register(r.id)}
                disabled={busy === r.id}
              >
                {busy === r.id ? <span className="spinner" /> : "freeeに登録（借)" + r.category + "／貸)役員借入金）"}
              </button>
            )}
          </div>
        </div>
      ))}

      <p className="hint" style={{ textAlign: "center", marginTop: 14 }}>
        ※ 立替の登録は 借)科目／貸)役員借入金（取引先＝立替えた人）。銀行明細と違い二重計上になりません。返金したら「払うもの」タブで消し込み。
      </p>
    </div>
  );
}
