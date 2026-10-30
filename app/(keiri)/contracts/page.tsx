"use client";

import { useEffect, useState, useCallback } from "react";
import { CONTRACT_KINDS } from "@/lib/contracts";

// 契約と管理ページ。中身より「いつまでに動くか」が大事なので、
// 解約予告の期限が近いものを上に出す。
// 電気・保険・ネット・Squareなどの管理ページ（マイページ）のURLとログインIDも
// ここに集め、種類ごとのタブで見られるようにする（2026-10-30）。パスワードは置かない。

type Status = { noticeBy?: string; daysToNotice?: number; daysToEnd?: number; alert: "" | "soon" | "passed"; message: string };
type Contract = {
  id: string; title: string; kind: string; party: string; partyContact?: string;
  signedOn?: string; startDate: string; endDate?: string;
  autoRenew: boolean; renewMonths?: number; noticeMonths?: number;
  monthlyAmount?: number; paymentTerms?: string; initialCost?: number;
  notes?: string; active: boolean; status: Status;
  portalUrl?: string; loginId?: string;
};

const fmt = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const blank = {
  title: "", kind: "その他", party: "", partyContact: "", signedOn: "",
  startDate: "", endDate: "", autoRenew: true, renewMonths: 12, noticeMonths: 1,
  monthlyAmount: "", paymentTerms: "", initialCost: "", notes: "",
  portalUrl: "", loginId: "",
};

export default function Contracts() {
  const [list, setList] = useState<Contract[] | null>(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<typeof blank & { id?: string }>({ ...blank });
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string>("");
  // 種類のタブ。"" はすべて
  const [tab, setTab] = useState("");
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
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          monthlyAmount: form.monthlyAmount ? Number(form.monthlyAmount) : undefined,
          initialCost: form.initialCost ? Number(form.initialCost) : undefined,
          renewMonths: form.renewMonths ? Number(form.renewMonths) : undefined,
          noticeMonths: form.noticeMonths ? Number(form.noticeMonths) : undefined,
          file: file || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "保存に失敗");
      setForm({ ...blank }); setFile(""); setOpen(false);
      window.scrollTo({ top: 0 });
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "保存に失敗"); }
    finally { setBusy(false); }
  };

  const startEdit = (c: Contract) => {
    setForm({
      id: c.id, title: c.title, kind: c.kind, party: c.party, partyContact: c.partyContact ?? "",
      signedOn: c.signedOn ?? "", startDate: c.startDate ?? "", endDate: c.endDate ?? "",
      autoRenew: c.autoRenew, renewMonths: c.renewMonths ?? 12, noticeMonths: c.noticeMonths ?? 0,
      monthlyAmount: c.monthlyAmount ? String(c.monthlyAmount) : "",
      paymentTerms: c.paymentTerms ?? "", initialCost: c.initialCost ? String(c.initialCost) : "",
      notes: c.notes ?? "", portalUrl: c.portalUrl ?? "", loginId: c.loginId ?? "",
    });
    setFile("");
    setOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const copyId = async (c: Contract) => {
    if (!c.loginId) return;
    try {
      await navigator.clipboard.writeText(c.loginId);
      setCopied(c.id);
      setTimeout(() => setCopied(""), 1500);
    } catch { /* コピーできなくても表示は見える */ }
  };

  const pickFile = (f: File | null) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setFile(String(r.result));
    r.readAsDataURL(f);
  };

  const showFile = async (id: string) => {
    const res = await fetch(`/api/contracts?file=${id}`);
    const j = await res.json();
    if (!res.ok) { setErr(j.error || "ファイルがありません"); return; }
    setViewing(j.file);
  };

  // タブ：登録がある種類だけ出す（並びは CONTRACT_KINDS の順）
  const kinds = CONTRACT_KINDS.filter((k) => (list ?? []).some((c) => c.kind === k));
  const shown = (list ?? []).filter((c) => !tab || c.kind === tab);
  const sorted = list
    ? [...shown].sort((a, b) => {
        const rank = (c: Contract) => (c.status.alert === "passed" ? 0 : c.status.alert === "soon" ? 1 : 2);
        return rank(a) - rank(b) || (a.endDate || "9999").localeCompare(b.endDate || "9999");
      })
    : [];

  return (
    <main>
      <h1>📜 契約・管理ページ</h1>
      <p className="lead">
        いま生きている約束と、その管理ページ（マイページ）をまとめる場所です。
        大事なのは中身より期限で、解約予告の期限を過ぎると自動で更新されてしまいます。
      </p>

      {err && <p className="err">{err}</p>}

      <button className="add" onClick={() => { if (open) { setForm({ ...blank }); setFile(""); } setOpen(!open); }}>
        {open ? "閉じる" : "＋ 契約・管理ページを登録"}
      </button>

      {open && (
        <section className="card form">
          {form.id && <p className="editing">「{form.title}」を編集しています</p>}
          <label>名前<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="京町パーキング 駐車場使用契約／電気（エネパル）" /></label>
          <label>種類
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {CONTRACT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label>相手先<input value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} placeholder="株式会社◯◯" /></label>
          <label>連絡先<input value={form.partyContact} onChange={(e) => setForm({ ...form, partyContact: e.target.value })} placeholder="TEL・住所" /></label>
          <label>管理ページのURL<input value={form.portalUrl} onChange={(e) => setForm({ ...form, portalUrl: e.target.value })} placeholder="https://… （マイページ・管理画面）" inputMode="url" /></label>
          <label>ログインID・お客様番号<input value={form.loginId} onChange={(e) => setForm({ ...form, loginId: e.target.value })} placeholder="MYIY… など" /></label>
          <p className="warn">パスワードはここに入れないでください。</p>
          <div className="row">
            <label>締結日<input type="date" value={form.signedOn} onChange={(e) => setForm({ ...form, signedOn: e.target.value })} /></label>
            <label>開始日（分かれば）<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
            <label>満了日<input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
          </div>
          <div className="row">
            <label className="ck">
              <input type="checkbox" checked={form.autoRenew} onChange={(e) => setForm({ ...form, autoRenew: e.target.checked })} />
              自動更新する
            </label>
            <label>更新の単位（か月）<input value={form.renewMonths} onChange={(e) => setForm({ ...form, renewMonths: Number(e.target.value) })} inputMode="numeric" /></label>
            <label>解約予告（か月前）<input value={form.noticeMonths} onChange={(e) => setForm({ ...form, noticeMonths: Number(e.target.value) })} inputMode="numeric" /></label>
          </div>
          <div className="row">
            <label>毎月の金額<input value={form.monthlyAmount} onChange={(e) => setForm({ ...form, monthlyAmount: e.target.value })} inputMode="numeric" placeholder="42000" /></label>
            <label>契約時の一時金<input value={form.initialCost} onChange={(e) => setForm({ ...form, initialCost: e.target.value })} inputMode="numeric" placeholder="礼金・保証金" /></label>
          </div>
          <label>支払条件<input value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} placeholder="毎月月末までに翌月分を振込" /></label>
          <label>覚えておくこと<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="特約など" /></label>
          <label>契約書のPDF・写真<input type="file" accept="application/pdf,image/*" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} /></label>
          {file && <p className="ok">ファイルを読み込みました</p>}
          <button onClick={save} disabled={busy}>{busy ? "保存中…" : "保存"}</button>
        </section>
      )}

      {kinds.length > 0 && (
        <div className="ct-tabs" role="tablist">
          <button role="tab" aria-selected={tab === ""} className={`ct-tab ${tab === "" ? "on" : ""}`} onClick={() => setTab("")}>
            すべて <span>{list?.length ?? 0}</span>
          </button>
          {kinds.map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`ct-tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
              {k} <span>{(list ?? []).filter((c) => c.kind === k).length}</span>
            </button>
          ))}
        </div>
      )}

      {sorted.map((c) => (
        <section className={`card contract ${c.status.alert}`} key={c.id}>
          <div className="head">
            <div>
              <span className="kind">{c.kind}</span>
              <h2>{c.title}</h2>
              <p className="party">{c.party}{c.partyContact ? ` ／ ${c.partyContact}` : ""}</p>
            </div>
            {c.monthlyAmount ? <div className="amt">{fmt(c.monthlyAmount)}<span>／月</span></div> : null}
          </div>

          <p className={`status ${c.status.alert}`}>
            {c.status.alert === "passed" ? "⚠️ " : c.status.alert === "soon" ? "🔔 " : ""}
            {c.status.message}
          </p>

          <ul className="facts">
            {(c.startDate || c.endDate) && <li><span>期間</span><b>{c.startDate || "?"} 〜 {c.endDate || "定めなし"}</b></li>}
            <li><span>更新</span><b>{c.autoRenew ? `自動更新（${c.renewMonths ?? 12}か月ごと）` : "自動更新なし"}</b></li>
            {c.noticeMonths ? <li><span>解約予告</span><b>{c.noticeMonths}か月前</b></li> : null}
            {c.initialCost ? <li><span>契約時の一時金</span><b>{fmt(c.initialCost)}</b></li> : null}
            {c.signedOn ? <li><span>締結日</span><b>{c.signedOn}</b></li> : null}
          </ul>

          {(c.portalUrl || c.loginId) && (
            <div className="portal">
              {c.portalUrl && (
                <a href={c.portalUrl} target="_blank" rel="noreferrer" className="portal-link">
                  管理ページを開く ↗
                </a>
              )}
              {c.loginId && (
                <button type="button" className="portal-id" onClick={() => copyId(c)} title="押すとコピー">
                  ID：<b>{c.loginId}</b>{copied === c.id ? " ✓ コピーしました" : ""}
                </button>
              )}
            </div>
          )}

          {c.paymentTerms && <p className="terms">支払条件：{c.paymentTerms}</p>}
          {c.notes && <p className="notes">{c.notes}</p>}

          <div className="acts">
            <button className="ghost" onClick={() => startEdit(c)}>編集</button>
            <button className="ghost" onClick={() => showFile(c.id)}>契約書を見る</button>
            <button className="ghost danger" onClick={async () => {
              if (!confirm(`${c.title} を削除しますか？`)) return;
              await fetch(`/api/contracts?id=${c.id}`, { method: "DELETE" });
              await load();
            }}>削除</button>
          </div>
        </section>
      ))}

      {list && list.length === 0 && <p className="empty">まだ登録がありません。</p>}

      {viewing && (
        <div className="viewer" onClick={() => setViewing("")}>
          {viewing.startsWith("data:application/pdf")
            ? <iframe src={viewing} title="契約書" />
            : <img src={viewing} alt="契約書" />}
        </div>
      )}

      <style jsx>{`
        main { max-width: 820px; margin: 0 auto; padding: 16px 14px 60px; }
        h1 { font-size: 20px; margin: 12px 0 4px; }
        .lead { color: #666; font-size: 13px; margin: 0 0 14px; max-width: 58ch; line-height: 1.7; }
        .err { color: #c53030; font-size: 13px; }
        .ok { color: #2f855a; font-size: 12px; margin: 0; }
        .add { border: 0; background: #2b6cb0; color: #fff; padding: 9px 16px; border-radius: 8px; font-size: 14px; cursor: pointer; }
        .card { background: #fff; border: 1px solid #eee; border-radius: 12px; padding: 16px; margin-top: 14px; }
        .form { display: grid; gap: 10px; }
        .form label { display: grid; gap: 4px; font-size: 12.5px; color: #555; }
        .form .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
        .form .ck { flex-direction: row; display: flex; align-items: center; gap: 8px; font-size: 13px; }
        input, select, textarea { padding: 8px 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; font-family: inherit; }
        .form > button { border: 0; background: #2b6cb0; color: #fff; padding: 10px; border-radius: 8px; font-size: 14px; cursor: pointer; }
        .contract.soon { border-color: #e0b072; background: #fffaf2; }
        .contract.passed { border-color: #d99; background: #fff6f5; }
        .head { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
        .kind { font-size: 11px; background: #eef2f6; color: #4a5b6b; padding: 2px 8px; border-radius: 99px; }
        .contract h2 { font-size: 16px; margin: 6px 0 2px; }
        .party { font-size: 12.5px; color: #777; margin: 0; }
        .amt { font-size: 20px; font-weight: 700; white-space: nowrap; }
        .amt span { font-size: 11px; color: #888; font-weight: 400; margin-left: 2px; }
        .status { font-size: 13px; margin: 12px 0; padding: 8px 10px; border-radius: 8px; background: #f5f5f3; color: #555; }
        .status.soon { background: #fdf1de; color: #8a5a1a; font-weight: 600; }
        .status.passed { background: #fbe6e4; color: #9c3a2e; font-weight: 700; }
        .facts { list-style: none; margin: 0 0 10px; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 4px 16px; }
        .facts li { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; border-bottom: 1px dashed #eee; padding: 4px 0; }
        .facts span { color: #888; }
        .terms, .notes { font-size: 12.5px; color: #666; margin: 6px 0 0; line-height: 1.7; }
        .notes { background: #f7f7f5; padding: 8px 10px; border-radius: 8px; white-space: pre-wrap; }
        .acts { display: flex; gap: 8px; margin-top: 12px; }
        .ghost { background: #eee; color: #333; border: 0; border-radius: 8px; padding: 6px 12px; font-size: 12.5px; cursor: pointer; }
        .ghost.danger { color: #c0392b; }
        .empty { color: #888; font-size: 13px; margin-top: 20px; }
        .editing { margin: 0; font-size: 12.5px; color: #2b6cb0; font-weight: 600; }
        .warn { margin: -4px 0 0; font-size: 11.5px; color: #9c3a2e; }
        .ct-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 16px 0 0; }
        .ct-tab { border: 1px solid #ddd; background: #fff; color: #333; border-radius: 99px; padding: 6px 12px; font-size: 12.5px; cursor: pointer; width: auto; }
        .ct-tab span { color: #999; margin-left: 2px; font-size: 11px; }
        .ct-tab.on { background: #2b6cb0; border-color: #2b6cb0; color: #fff; font-weight: 600; }
        .ct-tab.on span { color: #d6e4f5; }
        .portal { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 4px 0 8px; }
        .portal-link { display: inline-block; background: #2b6cb0; color: #fff; text-decoration: none; padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; }
        .portal-id { background: #f3f5f8; border: 1px dashed #c9d3df; color: #33475b; border-radius: 8px; padding: 6px 10px; font-size: 12.5px; cursor: pointer; width: auto; }
        .viewer { position: fixed; inset: 0; background: rgba(0,0,0,.8); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
        .viewer img { max-width: 100%; max-height: 100%; }
        .viewer iframe { width: 100%; height: 100%; border: 0; background: #fff; }
      `}</style>
    </main>
  );
}
