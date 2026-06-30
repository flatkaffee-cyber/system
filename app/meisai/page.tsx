"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import MeisaiItem, { type Txn } from "@/components/MeisaiItem";

export default function Meisai() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/freee/unprocessed")
      .then((r) => r.json())
      .then((j) => {
        setConnected(j.connected);
        setTxns(j.txns ?? []);
        if (j.error) setError(j.error);
      })
      .catch(() => setError("読み込みに失敗しました。"));
  }, []);

  const undecided = txns.filter((t) => !t.decision).length;

  return (
    <div className="wrap">
      <header>
        <h1>🧾 未処理の明細</h1>
        <p>freeeでまだ仕訳していない明細を、AIと相談して決めます</p>
      </header>
      <Nav />

      {error && <p className="err">{error}</p>}

      {connected === false && (
        <div className="card connect-card">
          <div>
            <strong>freee未接続</strong>
            <p className="hint" style={{ margin: "4px 0 10px" }}>
              接続すると未処理明細を読み込めます。
            </p>
          </div>
          <a className="connect-btn" href="/api/freee/authorize">freeeと接続する</a>
        </div>
      )}

      {connected === null && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          <span className="spinner" style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }} />
          読み込み中…
        </div>
      )}

      {connected && txns.length === 0 && !error && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          🎉 未処理の明細はありません。
        </div>
      )}

      {connected && txns.length > 0 && (
        <>
          <div className="connected-note">
            未処理 {undecided} 件 ／ freee連携中
          </div>
          {txns.map((t) => (
            <MeisaiItem key={t.id} txn={t} />
          ))}
          <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>
            ※ 決定した内容は freee の「自動で経理」で登録してください（銀行明細の登録は freee 側）。判断したノウハウ（取引先→用途）は自動で蓄積され、次回から提案されます。
          </p>
        </>
      )}
    </div>
  );
}
