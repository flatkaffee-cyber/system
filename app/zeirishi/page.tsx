"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";

type Review = {
  id: string;
  date: string;
  summary: string;
  amount: number;
  treatment: string;
  issue: string;
  status: "pending" | "done";
};

export default function Zeirishi() {
  const [reviews, setReviews] = useState<Review[] | null>(null);

  function load() {
    fetch("/api/reviews")
      .then((r) => r.json())
      .then((j) => setReviews(j.reviews ?? []))
      .catch(() => setReviews([]));
  }
  useEffect(load, []);

  async function toggle(id: string, status: "pending" | "done") {
    setReviews((rs) =>
      rs ? rs.map((r) => (r.id === id ? { ...r, status } : r)) : rs,
    );
    await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
  }

  const pending = reviews?.filter((r) => r.status === "pending") ?? [];

  return (
    <div className="wrap">
      <header>
        <h1>🧑‍💼 税理士に相談リスト</h1>
        <p>いったん処理しつつ、後で税理士と一緒に確認したい論点を保管</p>
      </header>
      <Nav />

      {reviews === null && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          <span className="spinner" style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }} />
          読み込み中…
        </div>
      )}

      {reviews && reviews.length === 0 && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          相談リストはまだありません。<br />
          <span className="hint">明細や領収書を処理する中で「税理士確認」の論点が出ると、ここに自動で溜まります。</span>
        </div>
      )}

      {reviews && reviews.length > 0 && (
        <>
          <div className="connected-note">
            未相談 {pending.length} 件 ／ 全 {reviews.length} 件
          </div>
          {reviews.map((r) => (
            <div key={r.id} className={`card review ${r.status === "done" ? "done" : ""}`}>
              <div className="review-head">
                <div>
                  <div className="review-summary">{r.summary || "（取引）"}</div>
                  <div className="review-sub">
                    {r.date}・¥{r.amount.toLocaleString()}
                  </div>
                </div>
                <button
                  className={r.status === "done" ? "ghost" : "pay-btn"}
                  onClick={() => toggle(r.id, r.status === "done" ? "pending" : "done")}
                >
                  {r.status === "done" ? "戻す" : "相談済みにする"}
                </button>
              </div>
              <div className="review-treat">いま採用: {r.treatment}</div>
              <div className="review-issue">🧐 論点: {r.issue}</div>
            </div>
          ))}
          <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>
            ※ ここは「今は標準処理で進めるが、後で税理士と確認したい」項目の置き場です。税理士との面談時にこのリストを一緒に見て、必要なら処理を修正してください。
          </p>
        </>
      )}
    </div>
  );
}
