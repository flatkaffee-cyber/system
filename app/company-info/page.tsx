"use client";

import { useState, useEffect } from "react";
import Nav from "@/components/Nav";

// 会社情報。書類を書くときや、役所・銀行で聞かれたときにすぐ見られるように1枚にまとめる。
// 値は lib/companyInfo.ts（最初から分かっているもの）＋画面で直した分（KV）。

type Group = { title: string; fields: { key: string; label: string; hint?: string; secret?: boolean }[] };

export default function CompanyInfo() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  // 伏せてある項目のうち、いま見せているもの
  const [shown, setShown] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/company-info")
      .then((r) => r.json())
      .then((d) => { setGroups(d.groups || []); setValues(d.values || {}); })
      .catch(() => setErr("読み込みに失敗しました"));
  }, []);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch { /* コピーできない環境では何もしない */ }
  };

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/company-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: draft }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "保存に失敗");
      setValues(d.values);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wrap">
      <header>
        <h1>🏢 会社情報</h1>
        <p>住所・法人番号・口座など。書類を書くときはここからコピーします</p>
      </header>
      <Nav />

      {err && <p className="err" style={{ textAlign: "center" }}>{err}</p>}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, margin: "0 0 8px" }}>
        {editing ? (
          <>
            <button className="ghost" onClick={() => setEditing(false)} disabled={busy}>やめる</button>
            <button className="primary" onClick={save} disabled={busy}>{busy ? "保存中..." : "保存する"}</button>
          </>
        ) : (
          <button className="ghost" onClick={() => { setDraft(values); setEditing(true); }}>✏️ 直す・足す</button>
        )}
      </div>

      {groups.map((g) => (
        <div key={g.title} className="card">
          <div className="cat-title">{g.title}</div>
          {g.fields.map((f) => {
            const v = values[f.key] || "";
            return (
              <div key={f.key} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{f.label}</div>
                {editing ? (
                  <>
                    {/* 複数行の項目（目的・社員など）は textarea で直す */}
                    {(draft[f.key] || "").includes("\n") ? (
                      <textarea
                        value={draft[f.key] || ""}
                        onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                        rows={(draft[f.key] || "").split("\n").length + 1}
                        style={{ width: "100%", boxSizing: "border-box", marginTop: 4 }}
                      />
                    ) : (
                      <input
                        value={draft[f.key] || ""}
                        onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                        style={{ width: "100%", boxSizing: "border-box", marginTop: 4 }}
                      />
                    )}
                    {f.hint && <div className="hint" style={{ margin: "2px 0 0" }}>{f.hint}</div>}
                  </>
                ) : v ? (
                  <div
                    onClick={() => copy(f.key, v)}
                    title="押すとコピー"
                    style={{ display: "flex", justifyContent: "space-between", gap: 8, cursor: "pointer", fontSize: 15, marginTop: 2 }}
                  >
                    <span style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
                      {f.secret && !shown[f.key] ? "••••••••" : /^https?:\/\//.test(v) ? (
                        <a href={v} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>開く ↗</a>
                      ) : v}
                      {f.secret && (
                        <button
                          className="ghost"
                          onClick={(e) => { e.stopPropagation(); setShown({ ...shown, [f.key]: !shown[f.key] }); }}
                          style={{ marginLeft: 8, padding: "1px 8px", fontSize: 11 }}
                        >
                          {shown[f.key] ? "隠す" : "表示"}
                        </button>
                      )}
                    </span>
                    <span style={{ fontSize: 11, color: copied === f.key ? "var(--ok)" : "var(--muted)", whiteSpace: "nowrap" }}>
                      {copied === f.key ? "コピーしました" : "コピー"}
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "#c0392b", marginTop: 2 }}>未入力（「直す・足す」から入れてください）</div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <p className="hint" style={{ textAlign: "center" }}>
        定款・登記簿・印鑑証明などの書類そのものは「経理 → 会社書類」に置いてあります。
      </p>
    </div>
  );
}
