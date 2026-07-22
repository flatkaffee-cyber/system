"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORIES } from "@/lib/receipt";
import Nav from "@/components/Nav";

const METHODS = ["口座振替", "振込", "コンビニ", "カード", "その他"] as const;
type Method = (typeof METHODS)[number];

type Bill = {
  id: string;
  payee: string;
  category: string;
  amount: number;
  method: Method;
  dueDay?: number;
  memo: string;
  startMonth: string;
  active: boolean;
};
type Payment = {
  billId: string;
  month: string;
  amount: number;
  paidAt?: string;
  registered?: { journalId: number; at: string };
} | null;
type Row = { bill: Bill; payment: Payment };

// YYYY-MM を1ヶ月ずらす
function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

type AddStatus = "idle" | "extracting" | "review";
type Form = {
  payee: string;
  category: string;
  amount: number;
  method: Method;
  dueDay: string;
  memo: string;
  startMonth: string;
};

export default function Bills() {
  const [month, setMonth] = useState<string>("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"list" | "add">("list");

  // 登録フロー
  const [addStatus, setAddStatus] = useState<AddStatus>("idle");
  const [image, setImage] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({
    payee: "",
    category: "不明",
    amount: 0,
    method: "その他",
    dueDay: "",
    memo: "",
    startMonth: "",
  });
  const inputRef = useRef<HTMLInputElement>(null);

  function load(m?: string) {
    const q = m ? `?month=${m}` : "";
    fetch(`/api/bills${q}`)
      .then((r) => r.json())
      .then((j) => {
        setMonth(j.month);
        setRows(j.rows ?? []);
      })
      .catch(() => setRows([]));
  }
  useEffect(() => load(), []);

  function changeMonth(delta: number) {
    const m = shiftMonth(month, delta);
    setRows(null);
    load(m);
  }

  async function setPaid(billId: string, amount: number, paid: boolean) {
    setBusy(billId);
    setMsg(null);
    try {
      const res = await fetch("/api/bills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: billId, action: "paid", month, paid, amount }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "更新に失敗");
      setRows((rs) => (rs ? rs.map((r) => (r.bill.id === billId ? { ...r, payment: j.payment } : r)) : rs));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function register(billId: string) {
    setBusy(billId);
    setMsg(null);
    try {
      const res = await fetch("/api/bills/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: billId, month }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "記帳に失敗");
      setRows((rs) =>
        rs
          ? rs.map((r) =>
              r.bill.id === billId
                ? {
                    ...r,
                    payment: {
                      billId,
                      month,
                      amount: r.payment?.amount ?? r.bill.amount,
                      paidAt: r.payment?.paidAt,
                      registered: { journalId: j.journalId, at: new Date().toISOString() },
                    },
                  }
                : r,
            )
          : rs,
      );
      setMsg(j.already ? "すでに記帳済みでした" : `freeeに記帳しました ✓（貸)${j.credit}）`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "記帳に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function del(billId: string) {
    if (!confirm("この定期請求を削除しますか？（月次の支払記録も消えます）")) return;
    setBusy(billId);
    try {
      await fetch(`/api/bills?id=${encodeURIComponent(billId)}`, { method: "DELETE" });
      setRows((rs) => (rs ? rs.filter((r) => r.bill.id !== billId) : rs));
    } catch {
      setMsg("削除に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function toggleImage(id: string) {
    setImages((m) => {
      if (m[id]) {
        const { [id]: _drop, ...rest } = m;
        return rest;
      }
      return { ...m, [id]: "loading" };
    });
    if (images[id]) return;
    try {
      const res = await fetch(`/api/bills/image?id=${encodeURIComponent(id)}`);
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

  // --- 登録フロー ---
  async function handleFile(file: File) {
    setAddErr(null);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    setImage(dataUrl);
    setAddStatus("extracting");
    try {
      const res = await fetch("/api/bills/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "抽出に失敗");
      const inv = j.invoice;
      setForm({
        payee: inv.payee ?? "",
        category: inv.category ?? "不明",
        amount: inv.amount ?? 0,
        method: (METHODS as readonly string[]).includes(inv.method) ? inv.method : "その他",
        dueDay: inv.dueDate && /^\d{4}-\d{2}-(\d{2})$/.test(inv.dueDate) ? inv.dueDate.slice(8, 10) : "",
        memo: "",
        startMonth: inv.billingMonth && /^\d{4}-\d{2}$/.test(inv.billingMonth) ? inv.billingMonth : month,
      });
      setAddStatus("review");
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : "抽出に失敗しました");
      setAddStatus("idle");
    }
  }

  async function saveBill() {
    setSaving(true);
    setAddErr(null);
    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payee: form.payee,
          category: form.category,
          amount: form.amount,
          method: form.method,
          dueDay: form.dueDay ? Number(form.dueDay) : undefined,
          memo: form.memo,
          startMonth: form.startMonth || month,
          image,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "保存に失敗");
      resetAdd();
      setTab("list");
      load(month);
      setMsg("定期請求を登録しました ✓");
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  function resetAdd() {
    setAddStatus("idle");
    setImage(null);
    setAddErr(null);
    setForm({ payee: "", category: "不明", amount: 0, method: "その他", dueDay: "", memo: "", startMonth: "" });
  }

  const isPdf = image?.startsWith("data:application/pdf") ?? false;
  const unpaid = rows?.filter((r) => !r.payment?.paidAt) ?? [];
  const unpaidTotal = unpaid.reduce((s, r) => s + (r.payment?.amount ?? r.bill.amount), 0);
  const monthlyTotal = rows?.reduce((s, r) => s + (r.payment?.amount ?? r.bill.amount), 0) ?? 0;

  return (
    <div className="wrap">
      <header>
        <h1>🔁 定期請求（毎月の固定費）</h1>
        <p>保険・駐車場・家賃など毎月払うものを登録 → 各月ちゃんと払えたか確認できます</p>
      </header>
      <Nav />

      <div className="kind-toggle" style={{ marginBottom: 12 }}>
        <button className={`kind-btn ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>
          今月のチェック
        </button>
        <button
          className={`kind-btn ${tab === "add" ? "active" : ""}`}
          onClick={() => {
            resetAdd();
            setTab("add");
          }}
        >
          ＋ 請求書を登録
        </button>
      </div>

      {msg && <p className="hint" style={{ textAlign: "center" }}>{msg}</p>}

      {/* ===== 今月のチェック ===== */}
      {tab === "list" && (
        <>
          <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button className="ghost" onClick={() => changeMonth(-1)}>
              ← 前月
            </button>
            <strong>{month}</strong>
            <button className="ghost" onClick={() => changeMonth(1)}>
              翌月 →
            </button>
          </div>

          {rows === null && (
            <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
              <span className="spinner" style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }} />
              読み込み中…
            </div>
          )}

          {rows && rows.length === 0 && (
            <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
              この月の固定費はまだありません。「＋ 請求書を登録」から追加してください。
            </div>
          )}

          {rows && rows.length > 0 && (
            <div className="card total-card">
              <div>
                <div className="total-label">未払い {unpaid.length}件 / 全{rows.length}件</div>
                <div className="total-amount">¥{unpaidTotal.toLocaleString()}</div>
                <div className="hint" style={{ marginTop: 4 }}>
                  今月の固定費 合計 ¥{monthlyTotal.toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {rows?.map((r) => {
            const paid = !!r.payment?.paidAt;
            const amount = r.payment?.amount ?? r.bill.amount;
            const registered = r.payment?.registered;
            return (
              <div key={r.bill.id} className={`card meisai ${paid ? "done" : ""}`}>
                <div className="meisai-head" style={{ cursor: "default" }}>
                  <div>
                    <div className="meisai-desc">
                      {r.bill.payee}
                      {paid ? <span className="hint-chip">支払済</span> : <span className="warn-chip">未払い</span>}
                    </div>
                    <div className="meisai-sub">
                      {r.bill.category}・{r.bill.method}
                      {r.bill.dueDay ? `・毎月${r.bill.dueDay}日` : ""}
                    </div>
                    {r.bill.memo && <div className="meisai-sub">📝 {r.bill.memo}</div>}
                  </div>
                  <div className="meisai-right">
                    <div className="meisai-amt out">¥{amount.toLocaleString()}</div>
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className={paid ? "ghost" : "pay-btn"}
                    style={{ flex: 1, minWidth: 140 }}
                    onClick={() => setPaid(r.bill.id, amount, !paid)}
                    disabled={busy === r.bill.id}
                  >
                    {busy === r.bill.id ? (
                      <span className="spinner" />
                    ) : paid ? (
                      "未払いに戻す"
                    ) : r.bill.method === "口座振替" ? (
                      "引き落とし確認済みにする"
                    ) : (
                      "支払い済みにする"
                    )}
                  </button>
                </div>

                <div style={{ marginTop: 8 }}>
                  {registered ? (
                    <div className="decided-box" style={{ margin: 0 }}>
                      ✓ freee記帳済（振替伝票 #{registered.journalId}）／ 借){r.bill.category}
                    </div>
                  ) : (
                    <button
                      className="rc-toggle"
                      style={{ width: "100%" }}
                      onClick={() => register(r.bill.id)}
                      disabled={busy === r.bill.id}
                    >
                      🧾 この月分をfreeeに記帳（借){r.bill.category}）
                    </button>
                  )}
                </div>

                <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="rc-toggle" style={{ flex: 1 }} onClick={() => toggleImage(r.bill.id)}>
                    {images[r.bill.id] ? "🖼 請求書を閉じる" : "🖼 請求書を見る"}
                  </button>
                  <button className="ghost" onClick={() => del(r.bill.id)} disabled={busy === r.bill.id}>
                    削除
                  </button>
                </div>
                {images[r.bill.id] === "loading" && (
                  <div style={{ textAlign: "center", color: "var(--muted)", marginTop: 8 }}>
                    <span className="spinner" style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }} />
                  </div>
                )}
                {images[r.bill.id] === "none" && (
                  <p className="hint" style={{ marginTop: 8 }}>
                    請求書の原本画像が保存されていません。
                  </p>
                )}
                {images[r.bill.id] && images[r.bill.id] !== "loading" && images[r.bill.id] !== "none" && (
                  images[r.bill.id].startsWith("data:application/pdf") ? (
                    <a
                      href={images[r.bill.id]}
                      target="_blank"
                      rel="noreferrer"
                      className="hint"
                      style={{ display: "block", marginTop: 8 }}
                    >
                      📄 PDFを別タブで開く
                    </a>
                  ) : (
                    <img src={images[r.bill.id]} alt="請求書" className="preview" style={{ marginTop: 8 }} />
                  )
                )}
              </div>
            );
          })}

          <p className="hint" style={{ textAlign: "center", marginTop: 14 }}>
            ※ 口座振替は「引き落とし確認済み」で消し込み。振込・コンビニは実際に払ってから「支払い済み」に。毎月ここを見れば払い漏れが分かります。
          </p>
        </>
      )}

      {/* ===== 請求書を登録 ===== */}
      {tab === "add" && (
        <>
          {addStatus === "idle" && (
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
                <strong>請求書・払込票をアップロード</strong>
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
              {addErr && <p className="err">{addErr}</p>}
              <p className="hint" style={{ textAlign: "center" }}>
                AIが支払先・金額・科目・支払方法・期日を読み取ります。手入力でも直せます。
              </p>
            </>
          )}

          {addStatus === "extracting" && (
            <div className="card" style={{ textAlign: "center" }}>
              {image &&
                (isPdf ? (
                  <div className="preview pdf-preview">📄 PDF を読み取ります</div>
                ) : (
                  <img src={image} alt="請求書" className="preview" />
                ))}
              <p style={{ marginTop: 16, color: "var(--muted)" }}>
                <span className="spinner" style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }} />
                AIが読み取り中…
              </p>
            </div>
          )}

          {addStatus === "review" && (
            <div className="card">
              {image &&
                (isPdf ? (
                  <div className="preview pdf-preview">📄 PDF を読み取ります</div>
                ) : (
                  <img src={image} alt="請求書" className="preview" />
                ))}
              <p className="hint" style={{ marginTop: 12 }}>内容を確認・修正して登録してください。</p>

              <label>支払先</label>
              <input value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} />

              <label>金額（月額・税込）</label>
              <input
                type="number"
                value={form.amount || ""}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              />

              <label>科目</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <label>支払方法</label>
              <select
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value as Method })}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <div className="row" style={{ marginTop: 8 }}>
                <div>
                  <label>毎月の支払・引落日（任意）</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    placeholder="例: 27"
                    value={form.dueDay}
                    onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
                  />
                </div>
                <div>
                  <label>開始月</label>
                  <input
                    type="month"
                    value={form.startMonth}
                    onChange={(e) => setForm({ ...form, startMonth: e.target.value })}
                  />
                </div>
              </div>

              <label>メモ（任意）</label>
              <textarea
                rows={2}
                value={form.memo}
                placeholder="例: 店舗総合保険 / 契約番号など"
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
              />

              {addErr && <p className="err">{addErr}</p>}
              <div style={{ marginTop: 16 }}>
                <button className="primary" onClick={saveBill} disabled={!form.payee || form.amount <= 0 || saving}>
                  {saving ? <span className="spinner" /> : "この内容で登録"}
                </button>
                <button className="ghost" onClick={resetAdd}>
                  ← やり直す
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
