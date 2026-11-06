"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { CONTRACT_KINDS } from "@/lib/contracts";
import { groupSites, isSiteOnly, SITE_KINDS } from "@/lib/keiri/sites";

// 契約や毎日使うサイトの管理画面へ飛ぶページ。データは契約（/api/contracts）と同じものを使う。
// 契約の画面は「いつまでに動くか」を見る場所で、こちらは「すぐ開く」ための場所。パスワードは置かない。

type Site = {
  id: string; title: string; kind: string; party: string; active: boolean;
  portalUrl?: string; loginId?: string; portalNote?: string;
  startDate?: string; monthlyAmount?: number; notes?: string;
};
type Form = { id?: string; title: string; kind: string; portalUrl: string; loginId: string; portalNote: string };

const blank: Form = { title: "", kind: SITE_KINDS[0], portalUrl: "", loginId: "", portalNote: "" };

export default function Sites() {
  const [list, setList] = useState<Site[] | null>(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/contracts");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "取得に失敗");
      setList(j.contracts);
    } catch (e) { setErr(e instanceof Error ? e.message : "取得に失敗"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form) return;
    setBusy(true); setErr("");
    try {
      const old = list?.find((c) => c.id === form.id);
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(old ? { ...old, ...form } : { ...form, party: form.title, autoRenew: false }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "保存に失敗");
      setForm(null);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "保存に失敗"); }
    finally { setBusy(false); }
  };

  const remove = async (s: Site) => {
    if (!confirm(`${s.title} を一覧から消しますか？`)) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/contracts?id=${s.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("削除に失敗");
      setForm(null);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "削除に失敗"); }
    finally { setBusy(false); }
  };

  const copyId = async (s: Site) => {
    if (!s.loginId) return;
    try {
      await navigator.clipboard.writeText(s.loginId);
      setCopied(s.id);
      setTimeout(() => setCopied(""), 1500);
    } catch { /* コピーできなくても表示は見える */ }
  };

  const edit = (s: Site) => {
    setForm({ id: s.id, title: s.title, kind: s.kind, portalUrl: s.portalUrl ?? "", loginId: s.loginId ?? "", portalNote: s.portalNote ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const editing = list?.find((c) => c.id === form?.id);
  const groups = groupSites(list ?? [], CONTRACT_KINDS);

  return (
    <div className="wrap st-wrap">
      <header>
        <h1>🔗 サイト一覧</h1>
        <p>契約や毎日使うサイトの管理画面へ、ここから飛べます。パスワードは置きません。</p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}

      <button type="button" className="st-add" onClick={() => setForm(form ? null : { ...blank })}>
        {form ? "閉じる" : "＋ サイトを追加"}
      </button>

      {form && (
        <section className="card st-form">
          {editing && <p className="st-editing">「{editing.title}」を編集しています</p>}
          <label>名前<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="freee会計" /></label>
          <label>URL<input type="url" inputMode="url" value={form.portalUrl} onChange={(e) => setForm({ ...form, portalUrl: e.target.value })} placeholder="https://" /></label>
          <label>分類
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {[...SITE_KINDS, ...CONTRACT_KINDS.filter((k) => !SITE_KINDS.includes(k))].map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
          <label>ログインID・お客様番号（パスワードは入れない）<input value={form.loginId} onChange={(e) => setForm({ ...form, loginId: e.target.value })} autoComplete="off" /></label>
          <label>何を見るページか<input value={form.portalNote} onChange={(e) => setForm({ ...form, portalNote: e.target.value })} placeholder="電気の使用量と請求" /></label>
          <div className="st-formacts">
            <button type="button" className="st-save" disabled={busy || !form.title.trim()} onClick={save}>{busy ? "保存中…" : "保存する"}</button>
            {editing && isSiteOnly(editing) && (
              <button type="button" className="st-del" disabled={busy} onClick={() => remove(editing)}>一覧から消す</button>
            )}
          </div>
        </section>
      )}

      {list === null && !err && <p className="hint">読み込み中…</p>}
      {list && groups.length === 0 && <p className="hint">まだ登録がありません。</p>}

      {groups.map((g) => (
        <section key={g.kind} className="st-group">
          <h2>{g.kind}</h2>
          <ul>
            {g.sites.map((s) => (
              <li key={s.id} className="st-row">
                {s.portalUrl ? (
                  <a className="st-open" href={s.portalUrl} target="_blank" rel="noreferrer">
                    <span className="st-text">
                      <span className="st-name">{s.title}</span>
                      {s.portalNote && <span className="st-desc">{s.portalNote}</span>}
                    </span>
                    <span className="st-go">開く ↗</span>
                  </a>
                ) : (
                  <div className="st-open">
                    <span className="st-text">
                      <span className="st-name">{s.title}</span>
                      {s.portalNote && <span className="st-desc">{s.portalNote}</span>}
                    </span>
                    <span className="st-nourl">URL未登録</span>
                  </div>
                )}
                <div className="st-tools">
                  {s.loginId && (
                    <button type="button" className="st-id" onClick={() => copyId(s)} title="押すとコピー">
                      ID {s.loginId}{copied === s.id ? " ✓ コピーしました" : ""}
                    </button>
                  )}
                  <button type="button" className="st-edit" onClick={() => edit(s)}>編集</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {list && (
        <p className="st-foot">
          契約の期限や契約書は <Link href="/contracts">契約・管理ページ</Link> にあります。
        </p>
      )}

      <style jsx>{`
        .st-wrap { max-width: 720px; }
        .st-add { width: auto; background: var(--accent); color: #fff; padding: 9px 14px; font-size: 14px; }
        .st-form { margin: 12px 0 0; }
        .st-form label:first-of-type { margin-top: 0; }
        .st-editing { margin: 0 0 10px; font-size: 13px; font-weight: 600; color: var(--accent); }
        .st-formacts { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 14px; }
        .st-save { width: auto; background: var(--accent); color: #fff; padding: 9px 18px; font-size: 14px; }
        .st-save:disabled, .st-del:disabled { opacity: 0.5; cursor: default; }
        .st-del { width: auto; background: none; color: #a33a2c; padding: 9px 6px; font-size: 13px; font-weight: 500; margin-left: auto; }
        .st-group { margin-top: 22px; }
        .st-group h2 { font-size: 13px; font-weight: 600; color: var(--muted); margin: 0 0 6px 2px; }
        .st-group ul { list-style: none; margin: 0; padding: 0; background: var(--card); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
        .st-row + .st-row { border-top: 1px solid var(--line); }
        .st-open { display: flex; align-items: center; gap: 12px; padding: 12px 14px 8px; color: var(--ink); text-decoration: none; }
        a.st-open:hover { background: #faf7f1; }
        a.st-open:hover .st-go { text-decoration: underline; text-underline-offset: 3px; }
        a.st-open:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
        .st-text { flex: 1; min-width: 0; }
        .st-name { display: block; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
        .st-desc { display: block; margin-top: 1px; font-size: 12.5px; color: var(--muted); }
        .st-go { flex: none; font-size: 13px; font-weight: 600; color: var(--accent); white-space: nowrap; }
        .st-nourl { flex: none; font-size: 12px; color: var(--muted); white-space: nowrap; }
        .st-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 0 14px 10px; }
        .st-id { width: auto; background: #f4f1ea; color: var(--ink); padding: 3px 8px; font-size: 12px; font-weight: 500; border-radius: 6px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; text-align: left; }
        .st-edit { width: auto; background: none; color: var(--muted); padding: 3px 4px; font-size: 12px; font-weight: 500; margin-left: auto; }
        .st-edit:hover { color: var(--accent); }
        .st-id:focus-visible, .st-edit:focus-visible, .st-add:focus-visible, .st-save:focus-visible, .st-del:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .st-foot { margin: 22px 2px 0; font-size: 12.5px; color: var(--muted); }
      `}</style>
    </div>
  );
}
