"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import type { PayablesResult } from "@/lib/payables";

export default function Payables() {
  const [data, setData] = useState<PayablesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function syncSheet() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/sync-sheet", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "同期に失敗");
      setSyncMsg(`✓ 売上計画シートに実績 ${j.count} 件を反映しました`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "同期に失敗しました");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    fetch("/api/payables")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("読み込みに失敗しました。"));
  }, []);

  const remaining = data
    ? data.payables
        .filter((p) => !paid[p.id])
        .reduce((s, p) => s + p.amount, 0)
    : 0;

  return (
    <div className="wrap">
      <header>
        <h1>💰 払うものリスト</h1>
        <p>freeeに登録済みで、まだ支払っていない立替・未払いの一覧</p>
      </header>
      <Nav />

      {error && <p className="err">{error}</p>}
      {!data && !error && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          <span className="spinner" style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }} />
          読み込み中…
        </div>
      )}

      {data && (
        <>
          {data.source === "snapshot" ? (
            <div className="card connect-card">
              <div>
                <strong>freee未接続</strong>
                <p className="hint" style={{ margin: "4px 0 10px" }}>
                  接続すると、このリストがfreeeの役員借入金から自動更新されます。
                </p>
              </div>
              <a className="connect-btn" href="/api/freee/authorize">
                freeeと接続する
              </a>
            </div>
          ) : (
            <div className="connected-note">✓ freee連携中（リアルタイム）</div>
          )}

          <div className="card total-card">
            <div>
              <div className="total-label">未払い合計（残り）</div>
              <div className="total-amount">¥{remaining.toLocaleString()}</div>
            </div>
          </div>

          <div className="card">
            <strong>📊 売上計画シートに実績を反映</strong>
            <p className="hint" style={{ margin: "4px 0 8px" }}>
              freeeの仕訳を会計マスターの「freee実績」タブに書き込み → 予実・月次・売上計画が自動更新されます。
            </p>
            <button className="primary" onClick={syncSheet} disabled={syncing}>
              {syncing ? <span className="spinner" /> : "実績を反映する"}
            </button>
            {syncMsg && <p className="hint" style={{ marginTop: 8 }}>{syncMsg}</p>}
          </div>

          {data.payables.map((p) => {
            const done = !!paid[p.id];
            return (
              <div key={p.id} className={`card pay-row ${done ? "done" : ""}`}>
                <div className="pay-main">
                  <div className="pay-payee">
                    {p.payee}
                    {!p.hasPartner && <span className="warn-chip">取引先未設定</span>}
                  </div>
                  <div className="pay-desc">{p.description}</div>
                  <div className="pay-acct">{p.account}</div>
                </div>
                <div className="pay-right">
                  <div className="pay-amount">¥{p.amount.toLocaleString()}</div>
                  <button
                    className={done ? "ghost" : "pay-btn"}
                    onClick={() => setPaid((s) => ({ ...s, [p.id]: !done }))}
                  >
                    {done ? "戻す" : "支払い済みにする"}
                  </button>
                </div>
              </div>
            );
          })}

          <p className="hint" style={{ textAlign: "center", marginTop: 14 }}>
            {data.source === "snapshot"
              ? `※ ${data.updatedAt}時点の freee データ。リアルタイム連携＆「支払い済み」のfreee自動消し込みは準備中（freeeアプリ登録後に有効化）。今の「支払い済み」ボタンは表示上の確認用です。`
              : "freeeとリアルタイム連携中。"}
          </p>
        </>
      )}
    </div>
  );
}
