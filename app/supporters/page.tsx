"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// クラウドファンディングの支援者へのお礼メールと、コーヒーチケットの受け渡し。
// CSVを貼る → 文面を確認 → まだ送っていない人に送る → 来店したら「渡した」を押す。

type Supporter = {
  id: string; name: string; email: string; course?: string; tickets: number;
  sentAt?: string; sendError?: string; redeemedAt?: string; note?: string;
};

const DEFAULT_SUBJECT = "【flat.】ご支援ありがとうございました｜コーヒーチケットのお渡しについて";

const DEFAULT_BODY = `{name} さま

このたびは flat. のクラウドファンディングにご支援いただき、
本当にありがとうございました。

彦根の小さなカフェですが、ここが誰かの「ふらっと寄れる場所」に
なればと思って続けています。その一歩を後押ししていただきました。


■ コーヒーチケットのお渡しについて

ご来店の際に、このメールをスタッフへお見せください。
その場でコーヒーチケット {tickets} 枚をお渡しします。

・受け取り期限　2027年3月31日まで
・チケットの有効期限　お渡しから3か月
・スマートフォンの画面でも、印刷したものでも構いません

事前のご連絡は不要です。お好きなタイミングでお越しください。


■ お店のご案内

flat.
滋賀県彦根市京町二丁目3-1
0749-46-5355
https://www.google.com/maps/search/?api=1&query=滋賀県彦根市京町二丁目3-1

カフェ　10:00〜18:00
バー　　19:00〜24:30（ラストオーダー 23:30）
火曜定休


ご不明な点があれば、このメールにご返信ください。
お会いできるのを楽しみにしています。

合同会社flat.　坂本 達郎`;

export default function Supporters() {
  const [list, setList] = useState<Supporter[]>([]);
  const [account, setAccount] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [tickets, setTickets] = useState(1);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/supporters");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setList(d.supporters || []);
      setAccount(d.account ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const doImport = async () => {
    if (!csv.trim()) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      const res = await fetch("/api/supporters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, tickets }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取り込み失敗");
      setMsg(
        `${d.added}人を取り込みました。` +
          (d.existing ? `${d.existing}人はすでに入っています。` : "") +
          (d.skipped?.length ? `読めなかった行が${d.skipped.length}件あります。` : ""),
      );
      setCsv("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取り込み失敗");
    } finally { setBusy(false); }
  };

  const unsent = list.filter((s) => !s.sentAt);

  const send = async () => {
    if (unsent.length === 0) return;
    if (!confirm(`まだ送っていない${unsent.length}人に、${account ?? "連携中のアカウント"} から送ります。取り消せません。`)) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      const res = await fetch("/api/supporters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", ids: unsent.map((s) => s.id), subject, body }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "送信失敗");
      const failed = (d.results || []).filter((r: { ok: boolean }) => !r.ok);
      setMsg(`${d.sent}人に送りました。` + (failed.length ? `${failed.length}人は失敗しています。` : ""));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "送信失敗");
    } finally { setBusy(false); }
  };

  const toggleRedeemed = async (s: Supporter) => {
    const next = !s.redeemedAt;
    if (next && !confirm(`${s.name}さんにコーヒーチケット${s.tickets}枚を渡しましたか？`)) return;
    setBusy(true);
    try {
      await fetch("/api/supporters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, redeemed: next }),
      });
      await load();
    } finally { setBusy(false); }
  };

  const shown = q.trim()
    ? list.filter((s) => (s.name + s.email).toLowerCase().includes(q.trim().toLowerCase()))
    : list;

  return (
    <div className="wrap">
      <header>
        <h1>☕ 支援者とコーヒーチケット</h1>
        <p>お礼メールを送って、来店したら渡した記録を付ける</p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}
      {msg && <p className="hint">{msg}</p>}

      <div className="card" style={{ padding: "12px 14px" }}>
        <div className="cat-title">送信に使うアカウント</div>
        {account ? (
          <p style={{ fontSize: 13, margin: 0 }}>
            <b>{account}</b> から送ります。
            {account !== "flat.kaffee@gmail.com" && (
              <span style={{ color: "#c0392b" }}>
                {" "}flat.kaffee@gmail.com ではありません。
                <a href="/api/google/authorize">繋ぎ直す</a>
              </span>
            )}
          </p>
        ) : (
          <p style={{ fontSize: 13, margin: 0, color: "#c0392b" }}>
            Googleに接続されていません。<a href="/api/google/authorize">flat.kaffee@gmail.com で接続する</a>
          </p>
        )}
      </div>

      <div className="card" style={{ padding: "12px 14px" }}>
        <div className="cat-title">1. 支援者を取り込む</div>
        <p className="hint" style={{ marginBottom: 6 }}>
          CAMPFIREのCSVをそのまま貼ってください。名前とメールアドレスの列を自動で探します。
          同じメールアドレスの人は二重に入りません。
        </p>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={5}
          placeholder="名前,メールアドレス,リターン&#10;坂本 達郎,example@example.com,コーヒーチケット2枚コース"
          style={{ width: "100%", fontSize: 12, padding: 8 }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12.5 }}>チケット枚数</label>
          <input
            type="number" min={1} value={tickets}
            onChange={(e) => setTickets(Number(e.target.value) || 1)}
            style={{ width: 70, fontSize: 12, padding: "4px 6px", flex: "0 0 auto" }}
          />
          <button onClick={doImport} disabled={busy || !csv.trim()}>取り込む</button>
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          コースごとに枚数が違うときは、枚数を変えて分けて貼ってください。
        </p>
      </div>

      <div className="card" style={{ padding: "12px 14px" }}>
        <div className="cat-title">2. 文面</div>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          style={{ width: "100%", fontSize: 13, padding: "6px 8px", marginBottom: 6 }}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={18}
          style={{ width: "100%", fontSize: 12.5, lineHeight: 1.8, padding: 8 }}
        />
        <p className="hint" style={{ marginTop: 6 }}>
          <code>{"{name}"}</code> は名前、<code>{"{tickets}"}</code> は枚数、
          <code>{"{course}"}</code> はコース名に置き換わります。
        </p>
        <div style={{ marginTop: 8 }}>
          <button
            onClick={send}
            disabled={busy || unsent.length === 0 || !account}
            style={{ background: "var(--accent)", color: "#fff", fontWeight: 700 }}
          >
            まだ送っていない{unsent.length}人に送る
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: "12px 14px" }}>
        <div className="cat-title">
          3. 来店したら渡す（{list.filter((s) => s.redeemedAt).length}/{list.length}人）
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="名前かメールで探す"
          style={{ width: "100%", fontSize: 13, padding: "6px 8px", marginBottom: 6 }}
        />
        {shown.length === 0 && <p className="hint">まだ誰も入っていません。</p>}
        {shown.map((s) => (
          <div key={s.id} style={{
            display: "flex", alignItems: "center", gap: 8, fontSize: 12.5,
            padding: "7px 0", borderTop: "1px solid var(--line-soft, #eee)",
            opacity: s.redeemedAt ? 0.55 : 1,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{s.name}</b> <span style={{ color: "var(--muted)" }}>{s.tickets}枚</span>
              <div style={{ color: "var(--muted)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>
                {s.email}
                {s.course ? `・${s.course}` : ""}
              </div>
              {s.sendError && <div style={{ color: "#c0392b", fontSize: 11 }}>送信失敗: {s.sendError}</div>}
            </div>
            <span style={{ flex: "0 0 auto", fontSize: 11, color: s.sentAt ? "var(--ok)" : "#c0392b" }}>
              {s.sentAt ? "送信済" : "未送信"}
            </span>
            <button
              onClick={() => toggleRedeemed(s)}
              disabled={busy}
              style={{
                fontSize: 11, padding: "3px 10px", flex: "0 0 auto",
                background: s.redeemedAt ? "var(--card)" : "var(--accent)",
                color: s.redeemedAt ? "var(--ink)" : "#fff",
                fontWeight: 700,
              }}
            >
              {s.redeemedAt ? "渡し済み" : "渡した"}
            </button>
          </div>
        ))}
        <p className="hint" style={{ marginTop: 8 }}>
          メールは転送もスクリーンショットもできます。渡したらここを押して、二重に渡さないようにしてください。
        </p>
      </div>
    </div>
  );
}
