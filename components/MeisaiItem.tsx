"use client";

import { useRef, useState } from "react";

type Line = { category: string; amount: number; memo?: string };
type Advice = {
  reply: string;
  needs_document: boolean;
  ready: boolean;
  partner: string;
  lines: Line[];
  kb_keyword: string;
  kb_note: string;
  tax_review: boolean;
  tax_review_reason: string;
};
type Doc = {
  id: string;
  title: string;
  type: string;
  summary: string;
  payNote: string;
  suggestedLines: Line[];
  taxReview: boolean;
  taxReviewReason: string;
};
export type Txn = {
  id: number;
  date: string;
  amount: number;
  side: "income" | "expense";
  description: string;
  walletName: string;
  hint: { category: string; note: string } | null;
  doc: Doc | null;
  decision: { lines: Line[]; partner: string } | null;
};
type Msg = { role: "user" | "assistant"; content: string };

export default function MeisaiItem({ txn }: { txn: Txn }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [decided, setDecided] = useState<{ lines: Line[]; partner: string } | null>(
    txn.decision,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const sideOut = txn.side === "expense";

  const docContext = txn.doc
    ? `種類:${txn.doc.type} / 名前:${txn.doc.title}\n要点:${txn.doc.summary}\nこの金額(¥${txn.amount.toLocaleString()})の内容:${txn.doc.payNote}\n書類の想定仕訳:${txn.doc.suggestedLines
        .map((l) => `${l.category} ¥${l.amount.toLocaleString()}(${l.memo})`)
        .join(" / ")}${
        txn.doc.taxReview ? `\n税理士論点:${txn.doc.taxReviewReason}` : ""
      }`
    : undefined;

  async function send(text: string, document?: string, emailCtx?: string) {
    if (loading) return;
    const userText = text || (document ? "この書類を読んで科目を判定して" : "");
    if (!userText && !document) return;
    const next: Msg[] = [...messages, { role: "user", content: userText }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/meisai-advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txn: {
            date: txn.date,
            amount: txn.amount,
            side: txn.side,
            description: txn.description,
          },
          messages: next,
          document,
          docContext,
          emailContext: emailCtx,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "判定に失敗");
      const a = json.advice as Advice;
      setAdvice(a);
      setMessages((m) => [...m, { role: "assistant", content: a.reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "エラー";
      setMessages((m) => [...m, { role: "assistant", content: `エラー: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function onFile(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    send(input, dataUrl);
  }

  async function searchEmail() {
    if (loading) return;
    const kw = input.trim();
    setMessages((m) => [...m, { role: "user", content: kw ? `「${kw}」でGmailを検索` : "Gmailから関連メールを探す" }]);
    setInput("");
    setLoading(true);
    let ctx = "";
    try {
      const res = await fetch("/api/gmail-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: txn.amount, description: txn.description, keyword: kw || undefined }),
      });
      const j = await res.json();
      if (!j.connected) {
        setMessages((m) => [...m, { role: "assistant", content: "Gmailが未接続です。上の「✉️ Gmailと接続」から接続してください。" }]);
        setLoading(false);
        return;
      }
      if (!j.mails || j.mails.length === 0) {
        const dbg = `検索した語: ${(j.queries ?? []).join(" / ") || "（なし）"}${j.error ? `\n⚠️エラー: ${j.error}` : ""}`;
        setMessages((m) => [...m, { role: "assistant", content: `メールが見つかりませんでした。\n${dbg}\n→ 上の入力に「花火」など具体的な語を入れて、もう一度「✉️Gmailから探す」を押すとその語で再検索します。` }]);
        setLoading(false);
        return;
      }
      ctx = j.mails
        .map(
          (mm: { subject: string; from: string; date: string; body: string; snippet: string }, i: number) =>
            `【メール${i + 1}】件名:${mm.subject}\n差出人:${mm.from}\n日付:${mm.date}\n本文:${(mm.body || mm.snippet).slice(0, 800)}`,
        )
        .join("\n\n");
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "メール検索でエラーが出ました。" }]);
      setLoading(false);
      return;
    }
    setLoading(false);
    await send("Gmailで見つかった関連メールに基づいて、この明細の仕訳を判定してください。", undefined, ctx);
  }

  async function decide() {
    if (!advice || !advice.ready) return;
    setLoading(true);
    try {
      const res = await fetch("/api/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txnId: txn.id,
          date: txn.date,
          description: txn.description,
          amount: txn.amount,
          partner: advice.partner,
          lines: advice.lines,
          kbKeyword: advice.kb_keyword,
          kbNote: advice.kb_note,
          taxReview: advice.tax_review,
          taxReviewReason: advice.tax_review_reason,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "保存失敗");
      setDecided({ lines: advice.lines, partner: advice.partner });
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`card meisai ${decided ? "done" : ""}`}>
      <div className="meisai-head" onClick={() => setOpen(!open)}>
        <div>
          <div className="meisai-desc">{txn.description}</div>
          <div className="meisai-sub">
            {txn.date}・{txn.walletName.split(" ")[0]}
            {txn.doc && !decided && (
              <span className="doc-chip">📄 {txn.doc.title}</span>
            )}
            {txn.hint && !txn.doc && !decided && (
              <span className="hint-chip">候補: {txn.hint.category}</span>
            )}
          </div>
        </div>
        <div className="meisai-right">
          <div className={`meisai-amt ${sideOut ? "out" : "in"}`}>
            {sideOut ? "-" : "+"}¥{txn.amount.toLocaleString()}
          </div>
          <div className="meisai-status">
            {decided ? "✓ 決定済" : open ? "閉じる" : "決める"}
          </div>
        </div>
      </div>

      {decided && (
        <div className="decided-box">
          <strong>freeeにこう登録：</strong>（取引先: {decided.partner || "—"}）
          <ul>
            {decided.lines.map((l, i) => (
              <li key={i}>
                {l.category} ¥{l.amount.toLocaleString()}
                {l.memo ? `（${l.memo}）` : ""}
              </li>
            ))}
          </ul>
          <p className="hint">
            ※ freeeの「自動で経理」でこの明細をこの内容で登録してください（銀行明細の登録はfreee側）。
          </p>
        </div>
      )}

      {open && !decided && (
        <div className="meisai-body">
          {txn.doc && messages.length === 0 && (
            <div className="doc-match">
              📄 保管庫に関連書類が見つかりました：<strong>{txn.doc.title}</strong>
              <button
                className="pay-btn"
                style={{ width: "100%", marginTop: 8 }}
                onClick={() => send(`保管庫の「${txn.doc!.title}」に基づいて、この明細の仕訳を判定してください。`)}
                disabled={loading}
              >
                この書類の支払いとして判定する
              </button>
            </div>
          )}
          <div className="rc-msgs">
            {messages.length === 0 && !txn.doc && (
              <p className="hint" style={{ marginTop: 0 }}>
                「AIに相談」で科目を一緒に決めます。書類（契約書・請求書・明細書）があればアップすると正確になります。
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.content || (loading && i === messages.length - 1 ? "…" : "")}
              </div>
            ))}
          </div>

          {advice?.ready && advice.lines.length > 0 && (
            <div className="propose">
              <div className="propose-title">提案された仕訳</div>
              <div className="propose-partner">取引先: {advice.partner || "—"}</div>
              {advice.lines.map((l, i) => (
                <div key={i} className="propose-line">
                  <span>{l.category}{l.memo ? `（${l.memo}）` : ""}</span>
                  <span>¥{l.amount.toLocaleString()}</span>
                </div>
              ))}
              {advice.kb_note && (
                <div className="propose-note">📝 覚える: {advice.kb_note}</div>
              )}
              {advice.tax_review && advice.tax_review_reason && (
                <div className="tax-note">
                  🧑‍💼 税理士に相談リストへ保存されます<br />
                  <span>論点: {advice.tax_review_reason}</span>
                </div>
              )}
              <button className="pay-btn" onClick={decide} disabled={loading} style={{ width: "100%", marginTop: 8 }}>
                この内容で決定（freee登録用に確定＆ノウハウ保存）
              </button>
            </div>
          )}

          <div className="composer" style={{ marginTop: 8 }}>
            <textarea
              rows={2}
              value={input}
              placeholder="例：これは家賃。／何の支払いか分からない 等"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <button className="primary" onClick={() => send(input)} disabled={loading} style={{ width: "auto", padding: "0 16px" }}>
              {loading ? <span className="spinner" /> : "相談"}
            </button>
          </div>
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
          <button className="rc-toggle" style={{ marginTop: 6 }} onClick={() => fileRef.current?.click()}>
            📎 書類をアップ（契約書・請求書・明細書／PDF・画像）
          </button>
          <button className="rc-toggle" style={{ marginTop: 6 }} onClick={searchEmail} disabled={loading}>
            ✉️ Gmailから関連メールを探す（この金額で検索）
          </button>
        </div>
      )}
    </div>
  );
}
