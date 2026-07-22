"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";

type RLine = { name: string; amount: number; category: string; tags?: string[] };

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
  lines?: RLine[];
  tags?: string[];
};

export default function Receipts() {
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // 原本画像：id -> dataURL（"none"=保存なし, "loading"=取得中）
  const [images, setImages] = useState<Record<string, string>>({});
  // AI品目推測：id -> 推測結果（未確定）。"loading"=推測中
  const [guesses, setGuesses] = useState<
    Record<string, "loading" | { lines: RLine[]; confidence: string; source: string }>
  >({});

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
      setMsg(
        j.already
          ? "すでに登録済みでした"
          : j.dateAdjusted
            ? `freeeに登録しました ✓（設立前支出のため発生日を期首 ${j.issueDate} で記帳。原本 ${j.originalDate}／創立費・開業費の扱いは税理士に確認を）`
            : "freeeに登録しました ✓",
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  // AIに品目を推測させる（原本画像があればVision、無ければ店名/金額から推測）
  async function guessItems(id: string) {
    setGuesses((g) => ({ ...g, [id]: "loading" }));
    setMsg(null);
    try {
      const res = await fetch("/api/receipts/guess-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "推測に失敗");
      setGuesses((g) => ({ ...g, [id]: { lines: j.lines ?? [], confidence: j.confidence, source: j.source } }));
    } catch (e) {
      setGuesses((g) => {
        const { [id]: _drop, ...rest } = g;
        return rest;
      });
      setMsg(e instanceof Error ? e.message : "推測に失敗しました");
    }
  }

  // 推測を承認してKVに確定保存
  async function confirmItems(id: string) {
    const g = guesses[id];
    if (!g || g === "loading") return;
    setBusy(id);
    setMsg(null);
    try {
      const res = await fetch("/api/receipts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, lines: g.lines }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "確定に失敗");
      // カードに反映（品目表示が出るようになる）
      setReceipts((rs) => (rs ? rs.map((r) => (r.id === id ? { ...r, lines: g.lines } : r)) : rs));
      setGuesses((gg) => {
        const { [id]: _drop, ...rest } = gg;
        return rest;
      });
      setMsg("品目を確定しました ✓");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "確定に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  function dismissGuess(id: string) {
    setGuesses((g) => {
      const { [id]: _drop, ...rest } = g;
      return rest;
    });
  }

  async function toggleImage(id: string) {
    // すでに開いている / 取得済みなら閉じる（stateから消す）
    setImages((m) => {
      if (m[id]) {
        const { [id]: _drop, ...rest } = m;
        return rest;
      }
      return { ...m, [id]: "loading" };
    });
    if (images[id]) return; // 閉じただけ
    try {
      const res = await fetch(`/api/receipts/image?id=${encodeURIComponent(id)}`);
      if (res.ok) {
        const j = await res.json();
        setImages((m) => ({ ...m, [id]: j.image ?? "none" }));
      } else {
        setImages((m) => ({ ...m, [id]: "none" }));
      }
    } catch {
      setImages((m) => ({ ...m, [id]: "none" }));
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

      {receipts?.map((r) => {
        const g = guesses[r.id];
        const noItems = !(r.lines && r.lines.length > 0) && !r.summary;
        return (
        <div key={r.id} className={`card meisai ${r.registered ? "done" : ""}`}>
          <div className="meisai-head" style={{ cursor: "default" }}>
            <div>
              <div className="meisai-desc">{r.vendor || "（店名なし）"}</div>
              <div className="meisai-sub">
                {r.date}・{r.category}・立替: {r.payer}
              </div>
              {r.lines && r.lines.length > 0
                ? r.lines.map((l, i) => (
                    <div key={i} className="meisai-sub">
                      🛒 {l.name || "（品目なし）"}
                      {r.lines!.length > 1 && ` ¥${l.amount.toLocaleString()}`}
                      <span style={{ color: "var(--muted)" }}>（{l.category}）</span>
                      {l.tags && l.tags.length > 0 && (
                        <span style={{ color: "var(--muted)" }}> [{l.tags.join("・")}]</span>
                      )}
                    </div>
                  ))
                : r.summary && <div className="meisai-sub">🛒 {r.summary}</div>}
              {r.memo && <div className="meisai-sub">📝 {r.memo}</div>}
            </div>
            <div className="meisai-right">
              <div className="meisai-amt out">¥{r.total.toLocaleString()}</div>
            </div>
          </div>

          {noItems && (
            <div style={{ marginTop: 8 }}>
              {!g && (
                <button className="rc-toggle" style={{ width: "100%" }} onClick={() => guessItems(r.id)}>
                  🔮 品目が未入力 — AIで推測する
                </button>
              )}
              {g === "loading" && (
                <div style={{ textAlign: "center", color: "var(--muted)" }}>
                  <span className="spinner" style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }} />{" "}
                  AIが品目を推測中…
                </div>
              )}
              {g && g !== "loading" && (
                <div className="dup-warn" style={{ borderColor: "#b7791f", background: "#fffbea" }}>
                  🔮 <strong>AIの推測</strong>（
                  {g.source === "image" ? "原本画像から" : "店名・金額から推測"}・自信度 {g.confidence}）
                  <div style={{ marginTop: 4 }}>
                    {g.lines.map((l, i) => (
                      <div key={i} className="meisai-sub" style={{ color: "#5b4a1a" }}>
                        🛒 {l.name || "（品目なし）"} ¥{(Number(l.amount) || 0).toLocaleString()}（{l.category}）
                        {l.tags && l.tags.length > 0 && ` [${l.tags.join("・")}]`}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12 }}>
                    確定すると品目として保存されます。内容が違うときは破棄して、🧾タブで登録し直してください。
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="ghost" onClick={() => dismissGuess(r.id)} disabled={busy === r.id}>
                      破棄
                    </button>
                    <button className="pay-btn" onClick={() => confirmItems(r.id)} disabled={busy === r.id}>
                      {busy === r.id ? <span className="spinner" /> : "この内容で確定（保存）"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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
          <button
            className="rc-toggle"
            style={{ marginTop: 8 }}
            onClick={() => toggleImage(r.id)}
          >
            {images[r.id] ? "🖼 原本を閉じる" : "🖼 原本を見る"}
          </button>
          {images[r.id] === "loading" && (
            <div style={{ textAlign: "center", color: "var(--muted)", marginTop: 8 }}>
              <span className="spinner" style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }} />
            </div>
          )}
          {images[r.id] === "none" && (
            <p className="hint" style={{ marginTop: 8 }}>
              この領収書は原本画像が保存されていません（サイズ超過や旧データの可能性）。
            </p>
          )}
          {images[r.id] && images[r.id] !== "loading" && images[r.id] !== "none" && (
            images[r.id].startsWith("data:application/pdf") ? (
              <a href={images[r.id]} target="_blank" rel="noreferrer" className="hint" style={{ display: "block", marginTop: 8 }}>
                📄 PDFを別タブで開く
              </a>
            ) : (
              <img src={images[r.id]} alt="領収書原本" className="preview" style={{ marginTop: 8 }} />
            )
          )}
        </div>
        );
      })}

      <p className="hint" style={{ textAlign: "center", marginTop: 14 }}>
        ※ 立替の登録は 借)科目／貸)役員借入金（取引先＝立替えた人）。銀行明細と違い二重計上になりません。返金したら「払うもの」タブで消し込み。
      </p>
    </div>
  );
}
