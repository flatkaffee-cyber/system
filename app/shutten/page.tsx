"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Nav from "@/components/Nav";

// 外部イベントへの出店準備。持ち物をチェックしながら積み込む。
// チェックは全員で共有（KV）。帰りの積み込みは「チェックを全部外す」でやり直す。

type Ev = { id: string; title: string; date: string; memo?: string };
type Item = { id: string; cat: string; name: string; qty?: string; note?: string; done: boolean };

const CATEGORIES = [
  "書類・お金", "テントまわり", "火まわり", "ホットサンド", "スープ", "ワッフル",
  "コーヒー", "ソフトドリンク", "冷やすもの", "衛生", "ゴミ", "その他",
];

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const dateLabel = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  if (!y) return d;
  return `${m}/${day}（${WEEK[new Date(y, m - 1, day).getDay()]}）`;
};

export default function ShuttenPage() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [id, setId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [hideDone, setHideDone] = useState(false);

  // 項目の追加
  const [addCat, setAddCat] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [addQty, setAddQty] = useState("");
  const [addNote, setAddNote] = useState("");

  // 項目の編集
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editNote, setEditNote] = useState("");

  // イベントの追加
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [copyFrom, setCopyFrom] = useState("");

  const load = useCallback(async (target?: string) => {
    try {
      const res = await fetch(`/api/shutten${target ? `?id=${encodeURIComponent(target)}` : ""}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setEvents(d.events || []);
      setId(d.id || "");
      setItems(d.items || []);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 他の人のチェックも見えるよう、画面に戻ってきたら読み直す
  useEffect(() => {
    const onFocus = () => { if (id) load(id); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [id, load]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/shutten", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "保存に失敗しました");
    return d;
  };

  const toggle = async (it: Item) => {
    // 先に画面を変えて、保存は後ろで
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)));
    try {
      await post({ action: "updateItem", itemId: it.id, done: !it.done });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗しました");
      load(id);
    }
  };

  const run = async (body: Record<string, unknown>, after?: () => void) => {
    try {
      await post(body);
      after?.();
      await load(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗しました");
    }
  };

  const handleAdd = (cat: string) => {
    if (!addName.trim()) return;
    run({ action: "addItem", cat, name: addName, qty: addQty, note: addNote }, () => {
      setAddName(""); setAddQty(""); setAddNote(""); setAddCat(null);
    });
  };

  const handleSaveEdit = (itemId: string) => {
    if (!editName.trim()) return;
    run({ action: "updateItem", itemId, name: editName, qty: editQty, note: editNote }, () => setEditId(null));
  };

  const handleCreateEvent = async () => {
    if (!newTitle.trim() || !newDate) return;
    try {
      const d = await post({ action: "createEvent", title: newTitle, date: newDate, memo: newMemo, copyFrom });
      setShowNew(false); setNewTitle(""); setNewDate(""); setNewMemo(""); setCopyFrom("");
      await load(d.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "作成に失敗しました");
    }
  };

  const grouped = useMemo(() => {
    const cats = [...CATEGORIES, ...items.map((i) => i.cat).filter((c) => !CATEGORIES.includes(c))];
    return [...new Set(cats)]
      .map((cat) => ({ cat, list: items.filter((i) => i.cat === cat) }))
      .filter((g) => g.list.length > 0 || addCat === g.cat);
  }, [items, addCat]);

  const doneCnt = items.filter((i) => i.done).length;
  const current = events.find((e) => e.id === id);
  const pct = items.length ? Math.round((doneCnt / items.length) * 100) : 0;

  return (
    <div className="wrap">
      <Nav />
      <header>
        <h1>🎪 出店準備</h1>
        <p>イベントに持って行くもののチェックリスト。チェックは全員で共有されます</p>
      </header>

      <div className="card">
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ marginTop: 0 }}>イベント</label>
            <select value={id} onChange={(e) => { setLoading(true); load(e.target.value); }}>
              {events.map((e) => (
                <option key={e.id} value={e.id}>{dateLabel(e.date)} {e.title}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: "0 0 auto" }}>
            <button onClick={() => { setShowNew(!showNew); setCopyFrom(id); }}>＋ イベントを追加</button>
          </div>
        </div>
        {current?.memo && <p className="hint" style={{ marginTop: 10 }}>{current.memo}</p>}

        {showNew && (
          <div className="new-ev">
            <label>イベント名</label>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="例：彦根シティマラソン" />
            <div className="row">
              <div>
                <label>日付</label>
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </div>
              <div>
                <label>持ち物をコピーする元</label>
                <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                  <option value="">コピーしない（空から作る）</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>{dateLabel(e.date)} {e.title}</option>
                  ))}
                </select>
              </div>
            </div>
            <label>メモ（場所・時間・連絡先など）</label>
            <input value={newMemo} onChange={(e) => setNewMemo(e.target.value)} />
            <div style={{ marginTop: 12 }}>
              <button className="primary" disabled={!newTitle.trim() || !newDate} onClick={handleCreateEvent}>作成</button>
            </div>
          </div>
        )}
      </div>

      {err && <p className="err">{err}</p>}

      {loading ? (
        <p style={{ textAlign: "center", color: "var(--muted)" }}>読み込み中...</p>
      ) : !id ? (
        <p style={{ textAlign: "center", color: "var(--muted)" }}>イベントを追加してください</p>
      ) : (
        <>
          <div className="card progress-card">
            <div className="progress-top">
              <strong>{doneCnt} / {items.length} 積み込み済み</strong>
              <span>{pct}%</span>
            </div>
            <div className="bar"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
            <div className="progress-actions">
              <label className="hide-done">
                <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
                済みを隠す
              </label>
              <button
                className="small"
                onClick={() => {
                  if (confirm("チェックを全部外します。帰りの積み込みなどでやり直すときに使います。よろしいですか？")) {
                    run({ action: "resetChecks" });
                  }
                }}
              >
                チェックを全部外す
              </button>
            </div>
          </div>

          {grouped.map(({ cat, list }) => {
            const shown = hideDone ? list.filter((i) => !i.done) : list;
            const catDone = list.filter((i) => i.done).length;
            return (
              <div key={cat} className="card cat-card">
                <div className="cat-head">
                  <h2>{cat}</h2>
                  <span className={catDone === list.length && list.length > 0 ? "cat-cnt all" : "cat-cnt"}>
                    {catDone}/{list.length}
                  </span>
                </div>

                {shown.map((it) =>
                  editId === it.id ? (
                    <div key={it.id} className="edit">
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="品名" />
                      <div className="row">
                        <div><input value={editQty} onChange={(e) => setEditQty(e.target.value)} placeholder="数量" /></div>
                        <div><input value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="メモ" /></div>
                      </div>
                      <div className="edit-actions">
                        <button className="primary small" onClick={() => handleSaveEdit(it.id)}>保存</button>
                        <button className="small" onClick={() => setEditId(null)}>やめる</button>
                        <button
                          className="small danger"
                          onClick={() => {
                            if (confirm(`「${it.name}」を消しますか？`)) {
                              run({ action: "deleteItem", itemId: it.id }, () => setEditId(null));
                            }
                          }}
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={it.id} className={`item ${it.done ? "done" : ""}`}>
                      <label className="check">
                        <input type="checkbox" checked={it.done} onChange={() => toggle(it)} />
                        <span className="name">
                          {it.name}
                          {it.qty && <span className="qty">{it.qty}</span>}
                          {it.note && <span className="note">{it.note}</span>}
                        </span>
                      </label>
                      <button
                        className="edit-btn"
                        aria-label="編集"
                        onClick={() => {
                          setEditId(it.id); setEditName(it.name);
                          setEditQty(it.qty || ""); setEditNote(it.note || "");
                        }}
                      >
                        ✏️
                      </button>
                    </div>
                  ),
                )}

                {addCat === cat ? (
                  <div className="edit">
                    <input
                      autoFocus
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) handleAdd(cat); }}
                      placeholder="品名"
                    />
                    <div className="row">
                      <div><input value={addQty} onChange={(e) => setAddQty(e.target.value)} placeholder="数量（任意）" /></div>
                      <div><input value={addNote} onChange={(e) => setAddNote(e.target.value)} placeholder="メモ（任意）" /></div>
                    </div>
                    <div className="edit-actions">
                      <button className="primary small" disabled={!addName.trim()} onClick={() => handleAdd(cat)}>追加</button>
                      <button className="small" onClick={() => setAddCat(null)}>やめる</button>
                    </div>
                  </div>
                ) : (
                  <button className="add-btn" onClick={() => { setAddCat(cat); setAddName(""); setAddQty(""); setAddNote(""); }}>
                    ＋ 追加
                  </button>
                )}
              </div>
            );
          })}

          <div className="card">
            <label style={{ marginTop: 0 }}>分類を増やして追加</label>
            <select value="" onChange={(e) => e.target.value && setAddCat(e.target.value)}>
              <option value="">分類を選ぶ</option>
              {CATEGORIES.filter((c) => !items.some((i) => i.cat === c)).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div style={{ textAlign: "center", margin: "18px 0 30px" }}>
            <button
              className="small danger"
              onClick={() => {
                if (current && confirm(`「${current.title}」と持ち物リストを消します。よろしいですか？`)) {
                  run({ action: "deleteEvent" }, () => setId(""));
                }
              }}
            >
              このイベントを削除
            </button>
          </div>
        </>
      )}

      <style jsx>{`
        .new-ev { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--line); }
        .progress-card { padding: 14px 16px; }
        .progress-top { display: flex; justify-content: space-between; font-size: 15px; }
        .progress-top span { color: var(--muted); }
        .bar { height: 10px; background: var(--accent-weak); border-radius: 5px; margin: 8px 0 10px; overflow: hidden; }
        .bar-fill { height: 100%; background: var(--ok); transition: width 0.2s ease; }
        .progress-actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .hide-done { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 14px; }
        .hide-done input { width: auto; }
        .cat-card { padding: 12px 14px; }
        .cat-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
        .cat-head h2 { font-size: 16px; margin: 0; }
        .cat-cnt { font-size: 13px; color: var(--muted); }
        .cat-cnt.all { color: var(--ok); font-weight: 700; }
        .item { display: flex; align-items: center; gap: 6px; border-bottom: 1px solid var(--line); }
        .item:last-of-type { border-bottom: 0; }
        .check { display: flex; align-items: flex-start; gap: 10px; flex: 1; margin: 0; padding: 10px 0; cursor: pointer; font-weight: 400; }
        .check input { width: 22px; height: 22px; flex: 0 0 auto; margin-top: 1px; accent-color: var(--ok); }
        .name { font-size: 15px; line-height: 1.45; color: var(--ink); }
        .qty { margin-left: 8px; font-size: 13px; color: var(--accent); font-weight: 700; }
        .note { display: block; font-size: 12px; color: var(--muted); }
        .done .name { color: var(--muted); text-decoration: line-through; }
        .edit-btn { border: 0; background: none; padding: 6px; cursor: pointer; opacity: 0.5; font-size: 14px; }
        .edit { padding: 10px 0; border-bottom: 1px solid var(--line); }
        .edit-actions { display: flex; gap: 6px; margin-top: 8px; }
        .add-btn { border: 0; background: none; color: var(--accent); padding: 8px 0 2px; cursor: pointer; font-size: 14px; }
        .small { padding: 6px 10px; font-size: 13px; }
        .danger { color: #c62828; }
      `}</style>
    </div>
  );
}
