"use client";

// 注文画面の「🎟 スタンプ」。会計の金額からスタンプの数を出し、1回きりのQRを出す。
// お客さんがLINEかスマホのカメラで読むと、LINEのスタンプカードにスタンプが付く（lib/stampcard）。

import { useEffect, useState } from "react";
import QRCode from "qrcode";

const YEN_PER_STAMP = 600;
const LAST_KEY = "stamp_last_amount";

/** 会計の直前に金額を覚えておく（スタンプの金額の初期値に使う） */
export function rememberStampAmount(amount: number) {
  try {
    sessionStorage.setItem(LAST_KEY, String(Math.round(amount)));
  } catch {
    /* 覚えられなくても、金額は手で入れられる */
  }
}

export default function StampIssue({ amount: given, orderId, compact = false }: { amount?: number; orderId?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [run, setRun] = useState(false);
  const [qr, setQr] = useState<{ img: string; stamps: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const start = () => {
    let a = given;
    if (!a) {
      try {
        a = Number(sessionStorage.getItem(LAST_KEY)) || undefined;
      } catch {
        /* 読めなければ空のまま */
      }
    }
    setAmount(a ? String(a) : "");
    // 木曜はランニングクラブの日なので、最初からオンにしておく（違えば外す）
    const wd = new Date(Date.now() + 9 * 3600_000).getUTCDay();
    setRun(wd === 4);
    setQr(null);
    setErr("");
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const n = Math.floor((Number(amount) || 0) / YEN_PER_STAMP);
  const total = n + (run && (Number(amount) || 0) > 0 ? 1 : 0);

  const issue = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/stamp/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), run, orderId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "QRを作れませんでした");
      const img = await QRCode.toDataURL(d.url, { width: 520, margin: 1, errorCorrectionLevel: "M" });
      setQr({ img, stamps: d.stamps });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "QRを作れませんでした");
    } finally {
      setBusy(false);
    }
  };

  const btn: React.CSSProperties = {
    padding: compact ? "8px 12px" : "12px 0", borderRadius: 10, fontSize: compact ? 13 : 15, fontWeight: 700, cursor: "pointer",
    border: "1px solid #1f3d2f", background: "#f3ead8", color: "#1f3d2f", width: compact ? "auto" : "100%",
  };

  return (
    <>
      <button type="button" style={btn} onClick={start}>🎟 スタンプカード</button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="スタンプのQR"
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", zIndex: 1000, padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 20, width: "min(420px, 100%)", display: "grid", gap: 12, color: "#1b1a17" }}>
            <strong style={{ fontSize: 17 }}>スタンプカード</strong>
            {!qr ? (
              <>
                <div style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>お会計の金額</span>
                  <input
                    id="stamp-amount"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="1300"
                    style={{ padding: "10px 12px", fontSize: 18, borderRadius: 8, border: "1px solid #ddd" }}
                  />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                  <input type="checkbox" checked={run} onChange={(e) => setRun(e.target.checked)} style={{ width: 22, height: 22 }} />
                  ランニングクラブに参加した（+1）
                </label>
                <div style={{ fontSize: 15 }}>
                  付くスタンプ：<strong style={{ fontSize: 20 }}>{total}個</strong>
                  <span style={{ fontSize: 12, color: "#6b665c", marginLeft: 6 }}>（¥600ごとに1つ）</span>
                </div>
                {err && <div style={{ color: "#b23a2c", fontSize: 13 }}>{err}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    disabled={busy || total === 0}
                    onClick={issue}
                    style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: total ? "#1f3d2f" : "#ccc", color: "#f3ead8", fontSize: 15, fontWeight: 700, cursor: total ? "pointer" : "not-allowed" }}
                  >
                    {busy ? "作っています…" : "QRを出す"}
                  </button>
                  <button type="button" onClick={() => setOpen(false)} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", fontSize: 15, cursor: "pointer" }}>閉じる</button>
                </div>
              </>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr.img} alt="スタンプのQRコード" style={{ width: "100%", maxWidth: 360, justifySelf: "center", imageRendering: "pixelated" }} />
                <div style={{ textAlign: "center", fontSize: 16 }}>
                  <strong style={{ fontSize: 22 }}>スタンプ {qr.stamps}個</strong>
                </div>
                <div style={{ fontSize: 13, color: "#6b665c", lineHeight: 1.7, textAlign: "center" }}>
                  お客さんに、LINEかスマホのカメラで読んでもらってください。<br />
                  1回だけ使えて、15分で使えなくなります。
                </div>
                <button type="button" onClick={() => setOpen(false)} style={{ padding: "12px 0", borderRadius: 10, border: "none", background: "#1f3d2f", color: "#f3ead8", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>読み終わった・閉じる</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
