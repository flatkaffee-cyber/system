"use client";

// お客さんのスタンプカード（LINEの中で開く）。https://liff.line.me/<LIFF ID>/stamp
// 会計のときに注文画面に出るQRを読むと ?c=<1回きりのコード> が付いて開き、スタンプが付く。
// 色は flat. のTシャツと同じ深緑×クリーム。

import { useCallback, useEffect, useState } from "react";

type Ticket = { id: string; kind: "drink" | "tshirt" | "goal"; from: string; createdAt: string; usedAt?: string };
type PubCard = {
  name: string;
  stamps: number;
  totalStamps: number;
  completed: number;
  tickets: Ticket[];
  used: Ticket[];
};
type Liff = {
  init: (c: { liffId: string }) => Promise<void>;
  isLoggedIn: () => boolean;
  isInClient: () => boolean;
  login: (o?: { redirectUri?: string }) => void;
  getAccessToken: () => string | null;
};

const CARD = 30;
const MID = 10;
const LIFF_ID =
  process.env.NEXT_PUBLIC_LIFF_ID_EVENT ||
  process.env.NEXT_PUBLIC_LIFF_ID_DJNIGHT ||
  process.env.NEXT_PUBLIC_LIFF_ID_NATSUMATSURI ||
  "";
const C = { green: "#1f3d2f", green2: "#2c5341", cream: "#f3ead8", ink: "#1b1a17", sub: "#6b665c", line: "#e4dccb", bg: "#f7f3ea" };
const label = (t: Ticket) => (t.kind === "tshirt" ? "Tシャツ 1枚" : t.kind === "goal" ? "30個のごほうび" : "ドリンク 1杯");
const hm = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

export default function StampCardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [card, setCard] = useState<PubCard | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "noline" | "error">("loading");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState<Ticket | null>(null);
  const [justUsed, setJustUsed] = useState<{ t: Ticket; at: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const call = useCallback(async (accessToken: string, extra: Record<string, unknown> = {}) => {
    const res = await fetch("/api/stamp/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, ...extra }),
    });
    const d = await res.json();
    if (d.card) setCard(d.card);
    if (!res.ok) throw new Error(d.error || "読み込めませんでした");
    return d as { added: number; card: PubCard };
  }, []);

  useEffect(() => {
    if (!LIFF_ID) {
      setState("noline");
      return;
    }
    const s = document.createElement("script");
    s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    s.onload = async () => {
      try {
        const liff = (window as unknown as { liff?: Liff }).liff;
        if (!liff) throw new Error("LINEが読み込めませんでした");
        await liff.init({ liffId: LIFF_ID });
        if (!liff.isLoggedIn()) {
          if (!liff.isInClient()) {
            setState("noline");
            return;
          }
          liff.login({ redirectUri: window.location.href });
          return;
        }
        const at = liff.getAccessToken();
        if (!at) throw new Error("LINEのログインが確かめられませんでした");
        setToken(at);
        const code = new URLSearchParams(window.location.search).get("c");
        try {
          const r = await call(at, code ? { code } : {});
          if (code && r.added) setMsg(`スタンプが ${r.added}個 つきました`);
        } catch (e) {
          setErr(e instanceof Error ? e.message : "読み込めませんでした");
        }
        // 同じQRで読み直さないように、コードはURLから消す
        if (code) {
          try {
            const u = new URL(window.location.href);
            u.searchParams.delete("c");
            window.history.replaceState(null, "", u.toString());
          } catch {
            /* 消せなくても、コードは1回きりなので二重には付かない */
          }
        }
        setState("ready");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "読み込めませんでした");
        setState("error");
      }
    };
    s.onerror = () => setState("noline");
    document.body.appendChild(s);
  }, [call]);

  const act = async (extra: Record<string, unknown>) => {
    if (!token) return;
    setBusy(true);
    setErr("");
    try {
      await call(token, extra);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "うまくいきませんでした");
    } finally {
      setBusy(false);
    }
  };

  const useNow = async (t: Ticket) => {
    if (!token) return;
    setBusy(true);
    setErr("");
    try {
      await call(token, { use: t.id });
      setJustUsed({ t, at: new Date().toISOString() });
      setConfirm(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "うまくいきませんでした");
    } finally {
      setBusy(false);
    }
  };

  const page: React.CSSProperties = { minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "'Hiragino Sans', 'Yu Gothic', system-ui, sans-serif", padding: "20px 16px 48px" };
  const btn: React.CSSProperties = { padding: "12px 16px", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer" };

  // チケットを使った直後は、お店の人に見せる画面
  if (justUsed) {
    return (
      <div style={{ ...page, background: C.green, color: C.cream, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ fontSize: 14, opacity: 0.85 }}>お店の人に見せてください</div>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{label(justUsed.t)}</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>使いました</div>
          <div style={{ fontSize: 16 }}>{hm(justUsed.at)}</div>
          <button style={{ ...btn, background: C.cream, color: C.green, marginTop: 20 }} onClick={() => setJustUsed(null)}>カードに戻る</button>
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={{ maxWidth: 440, margin: "0 auto", display: "grid", gap: 16 }}>
        {/* カード */}
        <div style={{ background: `linear-gradient(160deg, ${C.green2}, ${C.green})`, color: C.cream, borderRadius: 20, padding: "20px 18px", boxShadow: "0 10px 24px rgba(31,61,47,0.25)", display: "grid", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "0.02em" }}>flat.</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>STAMP CARD{card && card.completed > 0 ? ` ・ ${card.completed + 1}枚目` : ""}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
            {Array.from({ length: CARD }, (_, i) => {
              const on = !!card && i < card.stamps;
              const goal = i + 1 === MID || i + 1 === CARD;
              return (
                <div
                  key={i}
                  aria-label={`${i + 1}個目${on ? "（押してある）" : ""}`}
                  style={{
                    aspectRatio: "1", borderRadius: 999, display: "grid", placeItems: "center",
                    fontSize: goal && !on ? 10 : 13, fontWeight: 800,
                    background: on ? C.cream : "transparent",
                    color: on ? C.green : "rgba(243,234,216,0.6)",
                    border: on ? "none" : `1.5px ${goal ? "solid" : "dashed"} rgba(243,234,216,${goal ? 0.9 : 0.45})`,
                  }}
                >
                  {on ? "f." : i + 1 === MID ? "🍹" : i + 1 === CARD ? "🎁" : ""}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span>{card ? `${card.name} さん` : state === "loading" ? "読み込み中…" : ""}</span>
            <strong style={{ fontSize: 15 }}>{card ? `${card.stamps} / ${CARD}` : ""}</strong>
          </div>
        </div>

        {state === "noline" && (
          <div style={{ background: "#fff", borderRadius: 14, padding: 16, lineHeight: 1.8, fontSize: 14 }}>
            このカードはLINEの中で開きます。お店のQRを、LINEのアプリのカメラか、スマホのカメラで読んでください。
          </div>
        )}
        {msg && <div style={{ background: "#e5f3ea", color: "#1e7b3c", borderRadius: 12, padding: "12px 14px", fontWeight: 700, fontSize: 15 }}>🎉 {msg}</div>}
        {err && <div style={{ background: "#fbe5e2", color: "#b23a2c", borderRadius: 12, padding: "12px 14px", fontSize: 14 }}>{err}</div>}

        {/* チケット */}
        {card && (
          <div style={{ background: "#fff", borderRadius: 14, padding: 16, display: "grid", gap: 10 }}>
            <strong style={{ fontSize: 15 }}>もっているチケット</strong>
            {card.tickets.length === 0 && <div style={{ fontSize: 13, color: C.sub }}>まだありません。10個でドリンク1杯、30個でTシャツかドリンクチケット5枚がもらえます。</div>}
            {card.tickets.map((t) => (
              <div key={t.id} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{label(t)}</strong>
                  <span style={{ fontSize: 12, color: C.sub }}>{t.from}でもらった</span>
                </div>
                {t.kind === "goal" ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button disabled={busy} style={{ ...btn, flex: 1, background: C.green, color: C.cream }} onClick={() => act({ choose: t.id, choice: "tshirt" })}>Tシャツ 1枚</button>
                    <button disabled={busy} style={{ ...btn, flex: 1, background: C.green, color: C.cream }} onClick={() => act({ choose: t.id, choice: "drink5" })}>ドリンク 5枚</button>
                  </div>
                ) : confirm?.id === t.id ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 13, color: C.sub }}>お店の人の前で押してください。使うと戻せません。</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button disabled={busy} style={{ ...btn, flex: 1, background: C.green, color: C.cream }} onClick={() => useNow(t)}>使う</button>
                      <button style={{ ...btn, background: C.bg, color: C.ink }} onClick={() => setConfirm(null)}>やめる</button>
                    </div>
                  </div>
                ) : (
                  <button style={{ ...btn, background: C.cream, color: C.green }} onClick={() => setConfirm(t)}>このチケットを使う</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ルール */}
        <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.9 }}>
          ・お会計 ¥600 ごとにスタンプ1つ（1回のお会計ごと）<br />
          ・ランニングクラブの日に注文すると、もう1つ<br />
          ・10個でドリンク1杯、30個でTシャツ1枚かドリンクチケット5枚<br />
          ・スタンプは、お会計のときにお店のQRを読むと付きます
          {card && card.totalStamps > 0 && <><br />・これまでのスタンプ {card.totalStamps}個</>}
        </div>
        <div style={{ fontSize: 12, color: C.sub, textAlign: "center" }}>flat. ／ 滋賀県彦根市京町二丁目3-1</div>
      </div>
    </div>
  );
}
