"use client";

import { useState, useEffect, useCallback } from "react";

// 仕入れ表。2026-10-26 から Supabase（shiire_items）に持ち、この画面で足す・直す・消す。
// それまではGoogleスプレッドシートを読んでいたが、連携が切れるたびに見られなくなっていた。
// 「仕入れ」ページのタブの一つとして使うので、Navと見出しは持たない。

type Row = {
  id: number;
  section: string;
  name: string;
  supplier: string;
  url: string;
  price: number | null;
  capacity: string;
  note: string;
  orderQty: string;
  sort: number;
};
type Section = { title: string; rows: Row[] };
type Draft = {
  id?: number;
  section: string;
  name: string;
  supplier: string;
  url: string;
  price: string;
  capacity: string;
  note: string;
  orderQty: string;
};

const yen = (n: number | null) => (n === null ? "未記入" : `¥${n.toLocaleString()}`);
const toDraft = (r?: Row, section = ""): Draft => ({
  id: r?.id,
  section: r?.section ?? section,
  name: r?.name ?? "",
  supplier: r?.supplier ?? "",
  url: r?.url ?? "",
  price: r?.price != null ? String(r.price) : "",
  capacity: r?.capacity ?? "",
  note: r?.note ?? "",
  orderQty: r?.orderQty ?? "",
});

function EditForm({
  draft,
  setDraft,
  sections,
  busy,
  onSave,
  onDelete,
  onCancel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  sections: string[];
  busy: boolean;
  onSave: () => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const set = (k: keyof Draft, v: string) => setDraft({ ...draft, [k]: v });
  return (
    <form
      className="ef"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="ef-grid">
        <div className="ef-wide">
          <label>仕入れ物</label>
          <input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="例 クリームチーズ" />
        </div>
        <div>
          <label>見出し</label>
          <input list="ef-sections" value={draft.section} onChange={(e) => set("section", e.target.value)} />
          <datalist id="ef-sections">
            {sections.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div>
          <label>仕入れ先</label>
          <input value={draft.supplier} onChange={(e) => set("supplier", e.target.value)} placeholder="例 業務スーパー" />
        </div>
        <div className="ef-wide">
          <label>買うページのURL</label>
          <input inputMode="url" value={draft.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" />
        </div>
        <div>
          <label>価格（税込・円）</label>
          <input inputMode="numeric" value={draft.price} onChange={(e) => set("price", e.target.value)} />
        </div>
        <div>
          <label>容量</label>
          <input value={draft.capacity} onChange={(e) => set("capacity", e.target.value)} placeholder="例 227g・1000ml" />
        </div>
        <div>
          <label>1回の発注量</label>
          <input value={draft.orderQty} onChange={(e) => set("orderQty", e.target.value)} placeholder="例 1ケース（24本）" />
        </div>
        <div className="ef-wide">
          <label>メモ</label>
          <textarea rows={2} value={draft.note} onChange={(e) => set("note", e.target.value)} />
        </div>
      </div>
      <div className="ef-actions">
        <button type="submit" className="primary" disabled={busy}>{busy ? "保存中…" : "保存"}</button>
        <button type="button" onClick={onCancel} disabled={busy}>やめる</button>
        {onDelete && (
          <button type="button" className="ef-del" onClick={onDelete} disabled={busy}>消す</button>
        )}
      </div>
      <style jsx>{`
        .ef { margin: 6px 0 10px; padding: 12px; border-radius: 12px; background: #faf8f4; border: 1px solid var(--line); }
        .ef-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 4px 10px; }
        .ef-wide { grid-column: 1 / -1; }
        .ef label { margin-top: 6px; }
        .ef-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
        .ef-del { margin-left: auto; color: #c0392b; }
      `}</style>
    </form>
  );
}

export default function InventorySheet() {
  const [sections, setSections] = useState<Section[]>([]);
  const [total, setTotal] = useState(0);
  const [missingPrice, setMissingPrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  // 編集中の品目（id）か、新しく足す品目（"new"）
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(toDraft());
  const [busy, setBusy] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/inventory/sheet");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setSections(d.sections || []);
      setTotal(d.total || 0);
      setMissingPrice(d.missingPrice || 0);
      setOpen((prev) => prev ?? (d.sections?.[0]?.title || null));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!draft.name.trim() || !draft.section.trim()) return setErr("見出しと仕入れ物の名前を入れてください");
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/inventory/sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item: { ...draft, price: draft.price.trim() === "" ? null : draft.price } }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "保存に失敗");
      setMsg(`「${draft.name}」を保存しました`);
      setEditing(null);
      setOpen(draft.section);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: Row) => {
    if (!confirm(`「${r.name}」を仕入れ表から消しますか？`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/inventory/sheet?id=${r.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "削除に失敗");
      setMsg(`「${r.name}」を消しました`);
      setEditing(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "削除に失敗");
    } finally {
      setBusy(false);
    }
  };

  // 前のスプレッドシートから1回だけ取り込む（仕入れ表が空のときだけ出す）
  const importSheet = async () => {
    setBusy(true);
    setErr("");
    setNeedsReauth(false);
    try {
      const res = await fetch("/api/inventory/sheet/import", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        if (d.needsReauth) setNeedsReauth(true);
        throw new Error(d.error || "取り込みに失敗");
      }
      setMsg(`スプレッドシートから ${d.imported}件 取り込みました。これからはここで直せます`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取り込みに失敗");
    } finally {
      setBusy(false);
    }
  };

  const sectionNames = sections.map((s) => s.title);

  return (
    <>
      {err && <p className="err">{err}</p>}
      {msg && <div className="card" style={{ padding: "10px 14px", fontWeight: 700, color: "var(--ok)" }}>✓ {msg}</div>}

      <div className="card total-card">
        <div className="total-label">登録品目</div>
        <div className="total-amount">{total}件</div>
        <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 12.5, opacity: 0.85, flexWrap: "wrap", justifyContent: "center" }}>
          <span>{sections.length}カテゴリ</span>
          {missingPrice > 0 && <span>価格未記入 {missingPrice}件</span>}
        </div>
      </div>

      {!loading && total === 0 && (
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>前のスプレッドシートから取り込む</div>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.7 }}>
            仕入れ表はこの画面で直せるようになりました。最初の1回だけ、今までのGoogleスプレッドシートの中身を取り込みます。
            取り込んだあとはGoogleの連携は要りません。
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="primary" onClick={importSheet} disabled={busy}>
              {busy ? "取り込み中…" : "スプレッドシートから取り込む"}
            </button>
            {needsReauth && (
              <a
                href="/api/google/authorize"
                style={{
                  display: "inline-block", padding: "9px 14px", borderRadius: 8,
                  background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13.5, textDecoration: "none",
                }}
              >
                Googleに再接続する（取り込みの1回だけ）
              </a>
            )}
          </div>
        </div>
      )}

      {editing === "new" ? (
        <div className="card" style={{ padding: "12px 14px" }}>
          <strong>仕入れ物を足す</strong>
          <EditForm
            draft={draft}
            setDraft={setDraft}
            sections={sectionNames}
            busy={busy}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : (
        <button
          className="primary"
          style={{ width: "100%", marginBottom: 12 }}
          onClick={() => {
            setMsg("");
            setDraft(toDraft(undefined, open ?? sectionNames[0] ?? ""));
            setEditing("new");
          }}
        >
          ＋ 仕入れ物を足す
        </button>
      )}

      {loading && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>読み込み中…</div>
      )}

      {!loading &&
        sections.map((s) => {
          const isOpen = open === s.title;
          return (
            <div key={s.title} className="card" style={{ padding: "12px 14px" }}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : s.title)}
                aria-expanded={isOpen}
                style={{
                  width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit", color: "var(--ink)",
                }}
              >
                <strong style={{ fontSize: 15 }}>{s.title}</strong>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{s.rows.length}件 {isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div style={{ marginTop: 8 }}>
                  {s.rows.map((r) => (
                    <div key={r.id} style={{ borderTop: "1px solid var(--line-soft, #eee)", padding: "9px 0" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>
                            {r.url ? (
                              <a href={r.url} target="_blank" rel="noopener noreferrer">{r.name} ↗</a>
                            ) : (
                              r.name
                            )}
                          </div>
                          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, display: "flex", gap: "2px 12px", flexWrap: "wrap", fontVariantNumeric: "tabular-nums" }}>
                            <span>{r.supplier || "仕入れ先なし"}</span>
                            <span style={{ color: r.price === null ? "#b5651d" : "var(--ink)", fontWeight: 700 }}>{yen(r.price)}</span>
                            {r.capacity && <span>{r.capacity}</span>}
                            {r.orderQty && <span>1回 {r.orderQty}</span>}
                          </div>
                          {r.note && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{r.note}</div>}
                        </div>
                        <button
                          type="button"
                          style={{ fontSize: 12, flexShrink: 0 }}
                          onClick={() => {
                            setMsg("");
                            if (editing === r.id) return setEditing(null);
                            setDraft(toDraft(r));
                            setEditing(r.id);
                          }}
                        >
                          {editing === r.id ? "閉じる" : "直す"}
                        </button>
                      </div>
                      {editing === r.id && (
                        <EditForm
                          draft={draft}
                          setDraft={setDraft}
                          sections={sectionNames}
                          busy={busy}
                          onSave={save}
                          onDelete={() => remove(r)}
                          onCancel={() => setEditing(null)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

      <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>
        ※ 品名をタップすると仕入れ先のページが開きます。「直す」で価格・容量・メモなどを変えられます。
      </p>
    </>
  );
}
