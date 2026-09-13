"use client";

import { useCallback, useEffect, useState } from "react";
import Nav from "@/components/Nav";

// 週のシフトを組む画面。
// 希望（/shift-submit）から下書きを自動で作り、人と時間を直してから保存する。

const WD = ["日", "月", "火", "水", "木", "金", "土"];

type Avail = { weekday: number; start: string; end: string };
type Slot = {
  label: string;
  start: string;
  end: string;
  date: string;
  weekday: number;
  candidates: string[];
  staff: string | null;
};
type Day = { date: string; weekday: number; closed: boolean; slots: Slot[] };
type Data = {
  week: string;
  staff: string[];
  submitted: string[];
  notSubmitted: string[];
  availability: Record<string, Avail[]>;
  days: Day[];
  current: { id: string; date: string; staff: string; start: string; end: string }[];
  hasCurrent: boolean;
};

/** 画面で持つ1枠。自動の下書きを直したものがそのまま保存される */
type Row = { key: string; date: string; label: string; staff: string; start: string; end: string };

const toMin = (v: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};
const hours = (a: string, b: string) => {
  const s = toMin(a);
  const e = toMin(b);
  return s === null || e === null || e <= s ? 0 : (e - s) / 60;
};

function mondayOf(d: string) {
  const x = new Date(`${d}T00:00:00Z`);
  const w = x.getUTCDay();
  x.setUTCDate(x.getUTCDate() - ((w + 6) % 7));
  return x.toISOString().slice(0, 10);
}
function addDays(d: string, n: number) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

export default function ShiftBuild() {
  const [week, setWeek] = useState<string>("");
  const [data, setData] = useState<Data | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async (w?: string) => {
    setErr("");
    setMsg("");
    try {
      const r = await fetch(`/api/shift-build${w ? `?week=${w}` : ""}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "読み込みに失敗");
      setData(j);
      setWeek(j.week);
      // すでに組んである週は、その内容を出す。まだなら自動の下書き
      setRows(
        j.hasCurrent
          ? j.current
              .slice()
              .sort((a: Row, b: Row) => (a.date + a.start).localeCompare(b.date + b.start))
              .map((e: { id: string; date: string; staff: string; start: string; end: string }) => ({
                key: e.id,
                date: e.date,
                label: "",
                staff: e.staff,
                start: e.start,
                end: e.end,
              }))
          : draftRows(j.days),
      );
      setDirty(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "読み込みに失敗");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function draftRows(days: Day[]): Row[] {
    return days.flatMap((d) =>
      d.slots.map((s, i) => ({
        key: `${d.date}_${i}`,
        date: d.date,
        label: s.label,
        staff: s.staff ?? "",
        start: s.start,
        end: s.end,
      })),
    );
  }

  const autoFill = () => {
    if (!data) return;
    if (rows.length && !confirm("いまの内容を捨てて、希望から組み直します。よろしいですか？")) return;
    setRows(draftRows(data.days));
    setDirty(true);
    setMsg("希望から組み直しました。中身を確かめてから保存してください。");
  };

  const save = async () => {
    if (!data) return;
    const bad = rows.find((r) => !r.staff || hours(r.start, r.end) <= 0);
    if (bad) {
      setErr(`${bad.date} の枠に、人か時間が入っていません`);
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/shift-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: data.week,
          entries: rows.map((x) => ({ date: x.date, staff: x.staff, start: x.start, end: x.end })),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "保存に失敗");
      setMsg(`${data.week.slice(5).replace("-", "/")}の週を保存しました（${j.saved}枠）`);
      setDirty(false);
      await load(data.week);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗");
    } finally {
      setBusy(false);
    }
  };

  const upd = (key: string, patch: Partial<Row>) => {
    setRows((p) => p.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const del = (key: string) => {
    setRows((p) => p.filter((r) => r.key !== key));
    setDirty(true);
  };
  const add = (date: string) => {
    setRows((p) => [
      ...p,
      { key: `new_${Date.now()}`, date, label: "", staff: "", start: "9:00", end: "14:30" },
    ]);
    setDirty(true);
  };

  /** その人がその時間に入れるか。希望の外なら注意を出す */
  const outsideWish = (r: Row) => {
    if (!data || !r.staff) return false;
    const wd = new Date(`${r.date}T00:00:00Z`).getUTCDay();
    const av = data.availability[r.staff] ?? [];
    const s = toMin(r.start);
    const e = toMin(r.end);
    if (s === null || e === null) return false;
    return !av.some((x) => {
      const a = toMin(x.start);
      const b = toMin(x.end);
      return a !== null && b !== null && x.weekday === wd && a <= s && e <= b;
    });
  };

  const totals: Record<string, number> = {};
  for (const r of rows) totals[r.staff] = (totals[r.staff] ?? 0) + hours(r.start, r.end);

  if (!data) {
    return (
      <main className="wrap">
        <Nav />
        {err ? <p className="err">{err}</p> : <p style={{ textAlign: "center", padding: 40 }}>読み込み中…</p>}
      </main>
    );
  }

  const byDate: Record<string, Row[]> = {};
  for (const r of rows) (byDate[r.date] ??= []).push(r);

  return (
    <main className="wrap">
      <Nav />
      <h1 style={{ fontSize: 19, margin: "4px 0 2px" }}>🧩 シフトを組む</h1>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>
        提出された希望から下書きを作ります。人と時間を直してから保存してください。
      </p>

      <div className="card" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => load(addDays(week, -7))} disabled={busy}>← 前の週</button>
        <strong style={{ fontSize: 15 }}>
          {week.slice(5).replace("-", "/")} 〜 {addDays(week, 6).slice(5).replace("-", "/")}
        </strong>
        <button onClick={() => load(addDays(week, 7))} disabled={busy}>次の週 →</button>
        <input
          type="date"
          value={week}
          onChange={(e) => e.target.value && load(mondayOf(e.target.value))}
          style={{ marginLeft: "auto", width: 150 }}
        />
      </div>

      <div className="card">
        <div style={{ fontSize: 12.5, lineHeight: 1.9 }}>
          <div>
            提出済み: <b>{data.submitted.join("・") || "なし"}</b>
          </div>
          {data.notSubmitted.length > 0 && (
            <div style={{ color: "#c0392b" }}>
              未提出: <b>{data.notSubmitted.join("・")}</b>（この人は自動では入りません）
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="primary" style={{ flex: 2 }} onClick={autoFill} disabled={busy}>
            🪄 希望から自動で組む
          </button>
          <button
            className="primary"
            style={{ flex: 1, opacity: dirty ? 1 : 0.5 }}
            onClick={save}
            disabled={busy || !dirty}
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
        {data.hasCurrent && !dirty && (
          <p className="hint" style={{ marginTop: 8 }}>
            この週はすでに組んであります。作り直すときは「希望から自動で組む」を押してください。
          </p>
        )}
        {err && <p className="err">{err}</p>}
        {msg && <p className="hint">✅ {msg}</p>}
      </div>

      {data.days.map((d) => {
        const list = (byDate[d.date] ?? []).sort((a, b) =>
          (toMin(a.start) ?? 0) - (toMin(b.start) ?? 0),
        );
        return (
          <div className="card" key={d.date}>
            <div className="cat-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>
                {d.date.slice(5).replace("-", "/")}（{WD[d.weekday]}）
              </span>
              {d.closed && <span style={{ fontSize: 12, color: "var(--muted)" }}>定休日</span>}
            </div>

            {list.length === 0 && !d.closed && (
              <p style={{ fontSize: 12.5, color: "#c0392b", margin: "6px 0" }}>枠がありません</p>
            )}

            {list.map((r) => {
              const ng = outsideWish(r);
              return (
                <div
                  key={r.key}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
                    padding: "7px 0", borderTop: "1px solid var(--line)",
                  }}
                >
                  <input
                    value={r.start}
                    onChange={(e) => upd(r.key, { start: e.target.value })}
                    style={{ width: 62, textAlign: "center" }}
                  />
                  <span style={{ fontSize: 12 }}>〜</span>
                  <input
                    value={r.end}
                    onChange={(e) => upd(r.key, { end: e.target.value })}
                    style={{ width: 62, textAlign: "center" }}
                  />
                  <select
                    value={r.staff}
                    onChange={(e) => upd(r.key, { staff: e.target.value })}
                    style={{
                      flex: "1 1 96px", minWidth: 0,
                      borderColor: ng ? "#c0392b" : undefined,
                      color: r.staff ? undefined : "#c0392b",
                    }}
                  >
                    <option value="">（未定）</option>
                    {data.staff.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: 11.5, color: "var(--muted)", width: 40, textAlign: "right" }}>
                    {hours(r.start, r.end).toFixed(1)}h
                  </span>
                  <button onClick={() => del(r.key)} style={{ fontSize: 11 }}>削除</button>
                  {ng && (
                    <div style={{ flexBasis: "100%", fontSize: 11.5, color: "#c0392b" }}>
                      ⚠️ {r.staff}さんの希望の外です
                      {(data.availability[r.staff] ?? [])
                        .filter((a) => a.weekday === d.weekday)
                        .map((a) => `（希望 ${a.start}-${a.end}）`)
                        .join("") || "（この曜日の希望なし）"}
                    </div>
                  )}
                </div>
              );
            })}

            <button onClick={() => add(d.date)} style={{ fontSize: 12, marginTop: 8 }}>
              ＋ 枠を追加
            </button>

            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.8 }}>
              この日に入れる人：
              {data.staff
                .map((s) => {
                  const av = (data.availability[s] ?? []).filter((a) => a.weekday === d.weekday);
                  return av.length ? `${s}(${av.map((a) => `${a.start}-${a.end}`).join("/")})` : null;
                })
                .filter(Boolean)
                .join("　") || "なし"}
            </div>
          </div>
        );
      })}

      <div className="card" style={{ background: "var(--accent)", color: "#fff" }}>
        <div style={{ fontSize: 12, opacity: 0.85 }}>この週の合計</div>
        <div style={{ fontSize: 24, fontWeight: 800, margin: "2px 0 6px" }}>
          {rows.reduce((n, r) => n + hours(r.start, r.end), 0).toFixed(1)}h
        </div>
        <div style={{ fontSize: 13 }}>
          {data.staff.map((s) => (
            <span key={s} style={{ marginRight: 14 }}>
              {s} {(totals[s] ?? 0).toFixed(1)}h
            </span>
          ))}
          {totals[""] ? <span style={{ color: "#ffd9d9" }}>未定 {totals[""].toFixed(1)}h</span> : null}
        </div>
      </div>
    </main>
  );
}
