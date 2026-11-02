"use client";

import { useCallback, useEffect, useState } from "react";
import Nav from "@/components/Nav";

// インスタの定期ストーリー。営業日のオープン（10時・19時）や、毎週のランニングなどを決めておくと
// その時刻に自動で上げる。時刻の前に手で上げていれば、自動の分は出さない。

type Freq = "daily" | "weekly" | "monthly" | "custom";
type Slot = { time: string; imageIds: string[] };
type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  frequency: Freq;
  weekdays: number[];
  monthDays: number[];
  dates: string[];
  slots: Slot[];
  businessDaysOnly: boolean;
  skipIfPosted: boolean;
  skipWindowMin: number;
  startDate?: string;
  endDate?: string;
  next?: { date: string; time: string } | null;
};
type Img = { id: string; name: string; createdAt: string };
type Run = {
  key: string;
  ruleName: string;
  date: string;
  time: string;
  status: "posted" | "skipped" | "error" | "test";
  at: string;
  detail?: string;
};
type Conn = { username: string; userId: string; host: string; savedAt: string; refreshedAt?: string; lastError?: string };

const FREQ_LABEL: Record<Freq, string> = { daily: "毎日", weekly: "毎週", monthly: "毎月", custom: "日を指定" };
const WD = ["日", "月", "火", "水", "木", "金", "土"];
const STATUS: Record<Run["status"], { label: string; color: string }> = {
  posted: { label: "自動で上げた", color: "#2e7d32" },
  skipped: { label: "手で上げてあったので出さず", color: "#7a7a7a" },
  error: { label: "失敗", color: "#c0392b" },
  test: { label: "試しに上げた", color: "#2980b9" },
};

const imgSrc = (id: string) => `/api/instagram/img/${id}.jpg`;

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}（${WD[new Date(`${d}T00:00:00`).getDay()]}）`;

function summary(r: Rule, closedLabel: string): string {
  let s = "";
  if (r.frequency === "daily") s = "毎日";
  if (r.frequency === "weekly") s = `毎週 ${[...r.weekdays].sort().map((w) => WD[w]).join("・")}`;
  if (r.frequency === "monthly") s = `毎月 ${[...r.monthDays].sort((a, b) => a - b).join("・")}日`;
  if (r.frequency === "custom") s = r.dates.map(md).join("、");
  if (r.businessDaysOnly) s += `（営業日だけ・${closedLabel}と臨時休業は休み）`;
  return s;
}

const blank = (): Rule => ({
  id: "",
  name: "",
  enabled: true,
  frequency: "daily",
  weekdays: [],
  monthDays: [],
  dates: [],
  slots: [{ time: "10:00", imageIds: [] }],
  businessDaysOnly: true,
  skipIfPosted: true,
  skipWindowMin: 60,
});

/** 写真をストーリーの大きさ（幅1080まで）のJPEGに直す。インスタのAPIはJPEGしか受け付けない */
async function toJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ng) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ng(new Error("画像を読めませんでした"));
      i.src = url;
    });
    const scale = Math.min(1, 1080 / img.naturalWidth);
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function InstagramPage() {
  const [conn, setConn] = useState<Conn | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [images, setImages] = useState<Img[]>([]);
  const [closures, setClosures] = useState<string[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [closedLabel, setClosedLabel] = useState("火曜");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Rule | null>(null);
  const [token, setToken] = useState("");
  const [igId, setIgId] = useState("");
  const [newClosure, setNewClosure] = useState("");
  const [newDate, setNewDate] = useState("");
  /** 画像を選んでいる枠（edit.slots の番号） */
  const [picking, setPicking] = useState<number | null>(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const res = await fetch("/api/instagram", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setConn(d.conn);
      setRules(d.rules || []);
      setImages(d.images || []);
      setClosures(d.closures || []);
      setRuns(d.runs || []);
      setClosedLabel(d.closedLabel || "火曜");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function post(body: object, done?: string): Promise<boolean> {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "失敗しました");
      if (done) setMsg(done);
      await load();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "失敗しました");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: FileList | null, slotIndex: number) {
    if (!files || !edit) return;
    setBusy(true);
    setErr("");
    try {
      const added: string[] = [];
      for (const f of Array.from(files)) {
        const dataUrl = await toJpeg(f);
        const res = await fetch("/api/instagram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "upload", name: f.name, dataUrl }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "アップロードに失敗");
        added.push(d.image.id);
        setImages((xs) => [...xs, d.image]);
      }
      setEdit((r) => r && {
        ...r,
        slots: r.slots.map((s, i) => (i === slotIndex ? { ...s, imageIds: [...s.imageIds, ...added] } : s)),
      });
      setPicking(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "アップロードに失敗");
    } finally {
      setBusy(false);
    }
  }

  const setSlot = (i: number, patch: Partial<Slot>) =>
    setEdit((r) => r && { ...r, slots: r.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

  async function saveEdit() {
    if (!edit) return;
    if (await post({ action: "saveRule", rule: edit }, "保存しました")) setEdit(null);
  }

  const chip = (on: boolean): React.CSSProperties => ({
    padding: "7px 0", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13,
    border: on ? "2px solid var(--accent)" : "1px solid var(--line)",
    background: on ? "var(--accent-weak, #fdf3e8)" : "#fff",
    color: "var(--ink)",
  });

  return (
    <div className="wrap">
      <header>
        <h1>📸 インスタ</h1>
        <p>決まった時刻に、決まったストーリーを自動で上げる</p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}
      {msg && <p className="hint" style={{ color: "#2e7d32", fontWeight: 700 }}>{msg}</p>}
      {loading && <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>読み込み中…</div>}

      {/* 接続 */}
      {!loading && (
        <div className="card" style={{ padding: 14 }}>
          <div className="cat-title">インスタとの接続</div>
          {conn ? (
            <>
              <div style={{ fontSize: 14 }}>
                <strong>@{conn.username || conn.userId}</strong> に接続しています
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                {conn.host === "graph.instagram.com"
                  ? `インスタでログインしたトークン。週に1回、自動で期限を延ばします${conn.refreshedAt ? `（最後に延ばした日 ${conn.refreshedAt.slice(0, 10)}）` : ""}`
                  : "Facebookページ経由のトークン"}
              </div>
              {conn.lastError && (
                <p className="err" style={{ marginTop: 8 }}>最後のエラー: {conn.lastError}</p>
              )}
              <div style={{ marginTop: 10, textAlign: "right" }}>
                <button disabled={busy} onClick={() => confirm("接続を外しますか？自動の投稿も止まります") && post({ action: "disconnect" }, "接続を外しました")}>
                  接続を外す
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 13, margin: 0 }}>
                まだ接続していません。Metaの開発者ページで作ったアクセストークンを貼ってください。
              </p>
              <input placeholder="アクセストークン（IG… または EAA…）" value={token} onChange={(e) => setToken(e.target.value)} />
              {token.trim().startsWith("EAA") && (
                <input placeholder="インスタのアカウントID（数字）" value={igId} onChange={(e) => setIgId(e.target.value)} />
              )}
              <button className="primary" disabled={busy || !token.trim()}
                onClick={async () => { if (await post({ action: "connect", token, userId: igId }, "接続しました")) { setToken(""); setIgId(""); } }}>
                接続する
              </button>
              <details style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>トークンの作り方（最初に1回だけ）</summary>
                <ol style={{ paddingLeft: 18, margin: "6px 0" }}>
                  <li>インスタのアプリで flat. のアカウントをプロアカウント（ビジネス）にしておく</li>
                  <li>パソコンで developers.facebook.com を開き、「マイアプリ」→「アプリを作成」。用途は「Instagramでメッセージとコンテンツを管理」を選ぶ</li>
                  <li>アプリの「Instagram」→「InstagramログインによるAPI設定」を開く</li>
                  <li>「アクセストークンを生成する」で flat. のインスタにログインし、許可する</li>
                  <li>出てきたトークン（IGで始まる長い文字）をコピーして、上の欄に貼る</li>
                </ol>
                アプリは「開発モード」のままで大丈夫です（自分のアカウントにだけ投稿するため、審査は要りません）。
                トークンは60日で切れますが、このシステムが週に1回自動で延ばします。
              </details>
            </div>
          )}
        </div>
      )}

      {/* 決まりの一覧 */}
      {!loading && !edit && (
        <div className="card" style={{ padding: 14 }}>
          <div className="cat-title">定期ストーリー</div>
          {rules.length === 0 && (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>まだありません。下のボタンから足してください。</p>
          )}
          {rules.map((r) => (
            <div key={r.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line-soft, #eee)", opacity: r.enabled ? 1 : 0.5 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <strong style={{ fontSize: 15, flex: 1 }}>{r.name}</strong>
                {!r.enabled && <span style={{ fontSize: 11, color: "var(--muted)" }}>止めています</span>}
                <button onClick={() => setEdit({ ...r })} style={{ fontSize: 12 }}>編集</button>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                {summary(r, closedLabel)}
                {r.skipIfPosted && ` ・${r.skipWindowMin}分前から手で上げていたら出さない`}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                {r.slots.map((s) => (
                  <div key={s.time} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{s.time}</span>
                    {s.imageIds.map((id) => (
                      <img key={id} src={imgSrc(id)} alt="" style={{ width: 36, height: 64, objectFit: "cover", borderRadius: 4, border: "1px solid var(--line)" }} />
                    ))}
                    {s.imageIds.length === 0 && <span style={{ fontSize: 11, color: "#c0392b" }}>画像なし</span>}
                    {conn && s.imageIds.length > 0 && (
                      <button disabled={busy} style={{ fontSize: 11, padding: "3px 6px" }}
                        onClick={() => confirm(`「${r.name}」の${s.time}の画像を、いまインスタに上げますか？`) && post({ action: "postNow", ruleId: r.id, time: s.time }, "上げました。インスタで確かめてください")}>
                        いま上げる
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {r.enabled && (
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  次: {r.next ? `${md(r.next.date)} ${r.next.time}` : "予定なし"}
                </div>
              )}
            </div>
          ))}
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <button className="primary" onClick={() => setEdit(blank())}>＋ 定期ストーリーを足す</button>
          </div>
        </div>
      )}

      {/* 編集 */}
      {edit && (
        <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="cat-title">{edit.id ? "定期ストーリーを直す" : "定期ストーリーを足す"}</div>
          <input placeholder="名前（例: 朝夜のオープン、ランニング）" value={edit.name}
            onChange={(e) => setEdit({ ...edit, name: e.target.value })} />

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>頻度</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {(Object.keys(FREQ_LABEL) as Freq[]).map((f) => (
                <button key={f} style={chip(edit.frequency === f)} onClick={() => setEdit({ ...edit, frequency: f })}>
                  {FREQ_LABEL[f]}
                </button>
              ))}
            </div>
          </div>

          {edit.frequency === "weekly" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {WD.map((w, i) => (
                <button key={w} style={chip(edit.weekdays.includes(i))}
                  onClick={() => setEdit({ ...edit, weekdays: toggle(edit.weekdays, i) })}>{w}</button>
              ))}
            </div>
          )}

          {edit.frequency === "monthly" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <button key={d} style={{ ...chip(edit.monthDays.includes(d)), fontSize: 12, padding: "5px 0" }}
                  onClick={() => setEdit({ ...edit, monthDays: toggle(edit.monthDays, d) })}>{d}</button>
              ))}
            </div>
          )}

          {edit.frequency === "custom" && (
            <div>
              <div style={{ display: "flex", gap: 6 }}>
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={{ flex: 1 }} />
                <button disabled={!newDate} onClick={() => { setEdit({ ...edit, dates: [...new Set([...edit.dates, newDate])].sort() }); setNewDate(""); }}>足す</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {edit.dates.map((d) => (
                  <span key={d} style={{ fontSize: 12, padding: "3px 8px", borderRadius: 12, background: "var(--accent-weak, #fdf3e8)" }}>
                    {md(d)} <button style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }}
                      onClick={() => setEdit({ ...edit, dates: edit.dates.filter((x) => x !== d) })}>×</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>時刻と画像</div>
            {edit.slots.map((s, i) => (
              <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8, marginBottom: 6 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="time" value={s.time} step={300} onChange={(e) => setSlot(i, { time: e.target.value })} style={{ width: 110 }} />
                  <span style={{ flex: 1, fontSize: 11, color: "var(--muted)" }}>
                    {s.imageIds.length > 1 ? `${s.imageIds.length}枚を順に上げる` : ""}
                  </span>
                  {edit.slots.length > 1 && (
                    <button style={{ fontSize: 12 }} onClick={() => setEdit({ ...edit, slots: edit.slots.filter((_, j) => j !== i) })}>この時刻を消す</button>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {s.imageIds.map((id) => (
                    <div key={id} style={{ position: "relative" }}>
                      <img src={imgSrc(id)} alt="" style={{ width: 54, height: 96, objectFit: "cover", borderRadius: 4, border: "1px solid var(--line)" }} />
                      <button onClick={() => setSlot(i, { imageIds: s.imageIds.filter((x) => x !== id) })}
                        style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, padding: 0, fontSize: 12, lineHeight: "18px" }}>×</button>
                    </div>
                  ))}
                  <button onClick={() => setPicking(picking === i ? null : i)}
                    style={{ width: 54, height: 96, borderRadius: 4, border: "1px dashed var(--line)", fontSize: 20 }}>＋</button>
                </div>
                {picking === i && (
                  <div style={{ marginTop: 8, padding: 8, background: "#fafafa", borderRadius: 6 }}>
                    <label className="primary" style={{ display: "inline-block", padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, background: "var(--accent)", color: "#fff" }}>
                      写真をアップロード
                      <input type="file" accept="image/*" multiple hidden disabled={busy}
                        onChange={(e) => { upload(e.target.files, i); e.target.value = ""; }} />
                    </label>
                    {images.length > 0 && (
                      <>
                        <div style={{ fontSize: 11, color: "var(--muted)", margin: "8px 0 4px" }}>前にアップロードした画像から選ぶ</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {images.map((im) => (
                            <div key={im.id} style={{ position: "relative" }}>
                              <img src={imgSrc(im.id)} alt={im.name} title={im.name}
                                onClick={() => { setSlot(i, { imageIds: [...s.imageIds, im.id] }); setPicking(null); }}
                                style={{ width: 54, height: 96, objectFit: "cover", borderRadius: 4, cursor: "pointer", border: "1px solid var(--line)" }} />
                              <button title="画像を消す" disabled={busy}
                                onClick={() => confirm("この画像を消しますか？") && post({ action: "deleteImage", id: im.id })}
                                style={{ position: "absolute", bottom: 2, right: 2, fontSize: 10, padding: "0 4px" }}>消す</button>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            <button style={{ fontSize: 12 }} onClick={() => setEdit({ ...edit, slots: [...edit.slots, { time: "19:00", imageIds: [] }] })}>
              ＋ 時刻を足す
            </button>
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={edit.businessDaysOnly} onChange={(e) => setEdit({ ...edit, businessDaysOnly: e.target.checked })} />
            営業日だけ（{closedLabel}と臨時休業の日は出さない）
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
            <input type="checkbox" checked={edit.skipIfPosted} onChange={(e) => setEdit({ ...edit, skipIfPosted: e.target.checked })} />
            時刻の
            <input type="number" min={5} max={600} step={5} value={edit.skipWindowMin} disabled={!edit.skipIfPosted}
              onChange={(e) => setEdit({ ...edit, skipWindowMin: Number(e.target.value) })} style={{ width: 64 }} />
            分前から手でストーリーを上げていたら、自動では出さない
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
            <span>期間（任意）</span>
            <input type="date" value={edit.startDate || ""} onChange={(e) => setEdit({ ...edit, startDate: e.target.value || undefined })} style={{ flex: 1 }} />
            〜
            <input type="date" value={edit.endDate || ""} onChange={(e) => setEdit({ ...edit, endDate: e.target.value || undefined })} style={{ flex: 1 }} />
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={edit.enabled} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} />
            この定期ストーリーを動かす
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="primary" disabled={busy} onClick={saveEdit} style={{ flex: 1 }}>保存</button>
            <button onClick={() => { setEdit(null); setPicking(null); }} style={{ flex: 1 }}>やめる</button>
          </div>
          {edit.id && (
            <button disabled={busy} style={{ color: "#c0392b", fontSize: 12 }}
              onClick={async () => { if (confirm(`「${edit.name}」を消しますか？`) && await post({ action: "deleteRule", id: edit.id }, "消しました")) setEdit(null); }}>
              この定期ストーリーを消す
            </button>
          )}
          <p className="hint">
            APIからはスタンプ（リンク・メンション・場所・音楽）を付けられません。文字は画像に入れておいてください。
          </p>
        </div>
      )}

      {/* 臨時休業 */}
      {!loading && (
        <div className="card" style={{ padding: 14 }}>
          <div className="cat-title">臨時休業の日</div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 0 }}>
            「営業日だけ」にした定期ストーリーは、ここに入れた日と{closedLabel}には出ません。
          </p>
          <div style={{ display: "flex", gap: 6 }}>
            <input type="date" value={newClosure} onChange={(e) => setNewClosure(e.target.value)} style={{ flex: 1 }} />
            <button disabled={!newClosure || busy}
              onClick={async () => { if (await post({ action: "closures", dates: [...closures, newClosure] })) setNewClosure(""); }}>足す</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {closures.length === 0 && <span style={{ fontSize: 12, color: "var(--muted)" }}>なし</span>}
            {closures.map((d) => (
              <span key={d} style={{ fontSize: 12, padding: "3px 8px", borderRadius: 12, background: "#f3f3f3" }}>
                {md(d)} <button disabled={busy} style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }}
                  onClick={() => post({ action: "closures", dates: closures.filter((x) => x !== d) })}>×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 履歴 */}
      {!loading && (
        <div className="card" style={{ padding: 14 }}>
          <div className="cat-title">これまでの動き</div>
          {runs.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)" }}>まだありません。</p>}
          {runs.map((r) => (
            <div key={r.key + r.at} style={{ fontSize: 12.5, padding: "6px 0", borderTop: "1px solid var(--line-soft, #eee)" }}>
              <span style={{ fontWeight: 700 }}>{md(r.date)} {r.time}</span>{" "}
              {r.ruleName}{" "}
              <span style={{ color: STATUS[r.status].color, fontWeight: 700 }}>{STATUS[r.status].label}</span>
              {r.detail && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{r.detail}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
