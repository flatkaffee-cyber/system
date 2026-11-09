"use client";

// 業務チェックの「日報」。その日シフトに入った人ごとに「提出／下書き／まだ」と中身を出し、その場で書ける。
// テンプレート（lib/nippoFields）の欄に沿って書く。書いている途中は自動で下書き保存する（別の端末からも続きが書ける）。
// 「売れた数を入れる」で、その人のシフトの時間にレジで売れた数を販売個数の欄に入れる。

import { useCallback, useEffect, useRef, useState } from "react";
import { NIPPO_FIELDS, type NippoKey } from "@/lib/nippoFields";

type Report = { name: string; asOf?: string; draft?: boolean; at: string } & Partial<Record<NippoKey, string>>;
type Shift = { staff: string; start: string; end: string };
type Draft = Partial<Record<NippoKey | "asOf", string>>;

const NAMES = ["坂本", "町田", "櫻井", "バイト"];
const jstNow = () => new Date(Date.now() + 9 * 3600_000);
const nowHM = () => {
  const d = jstNow();
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const atLabel = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const toMin = (hm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export default function NippoCard({ date, shifts }: { date: string; shifts: Shift[] }) {
  const [reports, setReports] = useState<Record<string, Report>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const [fillBusy, setFillBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!date) return;
    try {
      const res = await fetch(`/api/nippo?date=${date}`);
      const d = await res.json();
      if (res.ok) setReports(d.reports || {});
    } catch {
      /* 読めなくても業務チェックは使える */
    }
  }, [date]);
  useEffect(() => { load(); }, [load]);

  // シフトの人＋シフトに無いのに書いた人
  const onShift = [...new Map(shifts.map((s) => [s.staff, s])).values()];
  const extra = Object.keys(reports).filter((n) => !onShift.some((s) => s.staff === n));
  const people = [
    ...onShift.map((s) => ({ name: s.staff, time: `${s.start}〜${s.end}`, start: s.start })),
    ...extra.map((n) => ({ name: n, time: "シフト外", start: "" })),
  ];
  const editingExtra = open !== null && !people.some((p) => p.name === open);
  const list = editingExtra ? [...people, { name: open!, time: "シフト外", start: "" }] : people;
  const submitted = people.filter((p) => reports[p.name] && !reports[p.name].draft).length;

  const post = async (name: string, body: Draft, draft: boolean) => {
    const res = await fetch("/api/nippo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, name, draft, ...body }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "保存に失敗");
    if (d.reports) setReports(d.reports);
    return d;
  };

  const startEdit = (name: string) => {
    const r = reports[name];
    setEdit({
      asOf: r?.asOf ?? nowHM(),
      ...Object.fromEntries(NIPPO_FIELDS.map((f) => [f.key, r?.[f.key] ?? ""])),
    });
    setOpen(name);
    setErr("");
    setSaved(r?.draft ? `下書きを開きました（${atLabel(r.at)}）` : "");
  };

  // 書いている途中は、手が止まって1.5秒たったら下書き保存する。提出済みの日報を直しているときは提出で保存
  const change = (k: NippoKey | "asOf", v: string) => {
    const next = { ...edit, [k]: v };
    setEdit(next);
    if (!open) return;
    const name = open;
    if (reports[name] && reports[name].draft === false) return;
    if (timer.current) clearTimeout(timer.current);
    setSaved("…");
    timer.current = setTimeout(async () => {
      try {
        await post(name, next, true);
        setSaved(`下書きを保存しました（${nowHM()}）`);
      } catch {
        setSaved("下書きを保存できませんでした。通信を確かめてください");
      }
    }, 1500);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const submit = async (name: string) => {
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    setErr("");
    try {
      await post(name, edit, false);
      setOpen(null);
      setSaved("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗");
    } finally {
      setBusy(false);
    }
  };

  // その人のシフトの時間（始まり〜何時時点）に、レジで売れた数を数えて販売個数の欄に入れる
  const fillSales = async (start: string) => {
    setFillBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/square/sales?date=${date}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "売上が読めません");
      const from = toMin(start) ?? 0;
      const to = toMin(edit.asOf ?? "") ?? 24 * 60 + 59;
      const counts = new Map<string, number>();
      for (const o of d.orders || []) {
        // 0時を過ぎた会計は24時台として数える
        const day = String(o.created_jst).slice(0, 10);
        const t = Number(String(o.created_jst).slice(11, 13)) * 60 + Number(String(o.created_jst).slice(14, 16)) + (day > date ? 24 * 60 : 0);
        if (t < from || t > to) continue;
        for (const it of o.items || []) {
          const n = String(it.name || "").trim();
          if (!n) continue;
          counts.set(n, (counts.get(n) ?? 0) + (Number(it.qty) || 1));
        }
      }
      const text = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n, q]) => `${n} ${q}`).join("\n");
      change("sales", text || "（この時間に売れたものはありません）");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "売上が読めません");
    } finally {
      setFillBusy(false);
    }
  };

  const pill = (r?: Report) => {
    const st = !r ? { t: "まだ", c: "#b5651d", b: "#fdf1e6" } : r.draft ? { t: `下書き ${atLabel(r.at)}`, c: "#7a6a00", b: "#fbf6dc" } : { t: `提出 ${atLabel(r.at)}`, c: "var(--ok)", b: "#eaf6ec" };
    return <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, whiteSpace: "nowrap", color: st.c, background: st.b }}>{st.t}</span>;
  };
  const btn: React.CSSProperties = {
    padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
    border: "1px solid var(--line)", background: "#fff", color: "var(--ink)",
  };
  const area: React.CSSProperties = {
    width: "100%", padding: "8px 10px", fontSize: 14, borderRadius: 8, border: "1px solid var(--line)",
    fontFamily: "inherit", resize: "vertical", lineHeight: 1.6,
  };

  return (
    <div className="card" style={{ padding: "12px 14px" }}>
      <div className="cat-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        📝 日報
        {people.length > 0 && (
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{submitted} / {people.length}人 提出</span>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 8px" }}>
        シフトが終わる前に書いて「提出」を押してください。書いている途中は自動で下書き保存されます。次に入る人も、ここで前の人の日報を読めます。
      </div>

      {people.length === 0 && !editingExtra && (
        <div style={{ fontSize: 13, color: "var(--muted)", padding: "6px 0" }}>この日はシフトが入っていません。</div>
      )}

      {list.map((p) => {
        const r = reports[p.name];
        const isOpen = open === p.name;
        return (
          <div key={p.name} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14 }}>{p.name}</strong>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{p.time}</span>
              {pill(r)}
              <span style={{ flex: 1 }} />
              {!isOpen && (
                <button style={btn} onClick={() => startEdit(p.name)}>{!r ? "書く" : r.draft ? "続きを書く" : "直す"}</button>
              )}
            </div>

            {/* 提出した中身（下書きは書いた本人が開いて続きを書く） */}
            {r && !r.draft && !isOpen && (
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {r.asOf && <div style={{ fontSize: 12, color: "var(--muted)" }}>{r.asOf}時点</div>}
                {NIPPO_FIELDS.filter((f) => r[f.key]).map((f) => (
                  <div key={f.key} style={{ fontSize: 13 }}>
                    <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700 }}>{f.label}</div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{r[f.key]}</div>
                  </div>
                ))}
              </div>
            )}

            {/* テンプレートに沿って書く */}
            {isOpen && (
              <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
                  何時時点
                  <input
                    id={`nippo-${p.name}-asof`}
                    value={edit.asOf ?? ""}
                    onChange={(e) => change("asOf", e.target.value)}
                    placeholder="13:00"
                    inputMode="numeric"
                    style={{ width: 90, padding: "6px 8px", fontSize: 14 }}
                  />
                  <button style={{ ...btn, padding: "4px 10px", fontSize: 12 }} onClick={() => change("asOf", nowHM())}>いま</button>
                </label>
                {NIPPO_FIELDS.map((f) => (
                  <div key={f.key} style={{ display: "grid", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{f.label}</span>
                      {f.key === "sales" && (
                        <button
                          style={{ ...btn, padding: "3px 10px", fontSize: 12 }}
                          disabled={fillBusy}
                          onClick={() => fillSales(p.start)}
                          title={p.start ? `${p.start}〜${edit.asOf ?? "いま"} にレジで売れた数` : "この日にレジで売れた数"}
                        >
                          {fillBusy ? "数えています…" : "売れた数を入れる"}
                        </button>
                      )}
                    </div>
                    <textarea
                      id={`nippo-${p.name}-${f.key}`}
                      value={edit[f.key] ?? ""}
                      onChange={(e) => change(f.key, e.target.value)}
                      placeholder={f.hint}
                      rows={f.rows}
                      style={area}
                    />
                  </div>
                ))}
                {err && <div style={{ color: "#c0392b", fontSize: 13 }}>{err}</div>}
                {saved && <div style={{ fontSize: 12, color: "var(--muted)" }}>{saved}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    style={{ ...btn, background: "var(--accent)", color: "#fff", border: "none", flex: 1 }}
                    disabled={busy}
                    onClick={() => submit(p.name)}
                  >
                    {busy ? "提出中…" : `${p.name}の日報を提出`}
                  </button>
                  <button style={btn} onClick={() => { setOpen(null); setSaved(""); }}>閉じる</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* シフトに無い人も書けるように */}
      {open === null && NAMES.filter((n) => !people.some((p) => p.name === n)).length > 0 && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8, fontSize: 12, color: "var(--muted)", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          シフトに無いけど入った人：
          {NAMES.filter((n) => !people.some((p) => p.name === n)).map((n) => (
            <button key={n} style={{ ...btn, padding: "4px 10px", fontSize: 12 }} onClick={() => startEdit(n)}>{n}</button>
          ))}
        </div>
      )}
    </div>
  );
}
