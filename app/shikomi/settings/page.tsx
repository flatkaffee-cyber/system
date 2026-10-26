"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";

// 仕込み品の設定（1回の量・消費期限・仕込む日・材料）を画面から変える。
// コード（lib/shikomi.ts の TASKS）の値が初期値で、ここで変えた分だけ上から重ねて保存する。
// 「初期値に戻す」で変えた分を消せる。ここで足した仕込み品は「消す」で消える。

type Task = {
  id: string;
  name: string;
  kind: string;
  intervalDays: number;
  shelfLifeDays?: number;
  batch?: number;
  unit?: string;
  batchByWeekday?: Partial<Record<number, number>>;
  perLoaf?: number;
  weekday?: number[];
  biweekly?: boolean;
  qty?: string;
  materials?: string;
  note?: string;
  minutes?: number;
  openingTask?: string;
  steps?: string[];
  stepsDraft?: boolean;
  hidden?: boolean;
  isAdded?: boolean;
  isEdited?: boolean;
};

/** 画面で触る項目。ここに無い項目（openingTask など）は変えない */
type Form = {
  name: string;
  batch: string;
  unit: string;
  qty: string;
  shelfLifeDays: string;
  mode: "interval" | "weekday";
  intervalDays: string;
  weekday: number[];
  biweekly: boolean;
  byWd: Record<number, string>;
  materials: string;
  /** 仕込み方。1行が1手順 */
  steps: string;
  stepsDraft: boolean;
  note: string;
  minutes: string;
};

const WD = ["日", "月", "火", "水", "木", "金", "土"];
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];

const toForm = (t?: Task): Form => ({
  name: t?.name ?? "",
  batch: t?.batch != null ? String(t.batch) : "",
  unit: t?.unit ?? "",
  qty: t?.qty ?? "",
  shelfLifeDays: t?.shelfLifeDays != null ? String(t.shelfLifeDays) : "",
  mode: t?.weekday?.length ? "weekday" : "interval",
  intervalDays: t ? String(t.intervalDays) : "7",
  weekday: t?.weekday ?? [],
  biweekly: !!t?.biweekly,
  byWd: Object.fromEntries(
    Object.entries(t?.batchByWeekday ?? {}).map(([k, v]) => [Number(k), String(v)]),
  ),
  materials: t?.materials ?? "",
  steps: (t?.steps ?? []).join("\n"),
  stepsDraft: !!t?.stepsDraft,
  note: t?.note ?? "",
  minutes: t?.minutes != null ? String(t.minutes) : "",
});

const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

/** フォームを保存する形に。曜日で決めるものは、何日おきかを曜日から出す（分析の予定日数に使う） */
function fromForm(f: Form): Partial<Task> {
  const weekday = f.mode === "weekday" ? [...f.weekday].sort() : [];
  const byWd: Partial<Record<number, number>> = {};
  if (f.mode === "weekday") {
    for (const w of weekday) {
      const n = num(f.byWd[w] ?? "");
      if (n !== undefined && !Number.isNaN(n)) byWd[w] = n;
    }
  }
  const interval =
    f.mode === "weekday" && weekday.length
      ? Math.round(((7 * (f.biweekly ? 2 : 1)) / weekday.length) * 10) / 10
      : Number(f.intervalDays) || 7;
  return {
    name: f.name.trim(),
    batch: num(f.batch),
    unit: f.unit.trim() || undefined,
    qty: f.qty.trim() || undefined,
    shelfLifeDays: num(f.shelfLifeDays),
    intervalDays: interval,
    weekday: weekday.length ? weekday : undefined,
    biweekly: f.mode === "weekday" && f.biweekly ? true : undefined,
    batchByWeekday: Object.keys(byWd).length ? byWd : undefined,
    materials: f.materials.trim() || undefined,
    steps: (() => {
      const lines = f.steps.split("\n").map((l) => l.trim()).filter(Boolean);
      return lines.length ? lines : undefined;
    })(),
    stepsDraft: f.stepsDraft,
    note: f.note.trim() || undefined,
    minutes: num(f.minutes),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const summary = (t: Task) => {
  const sched = t.weekday?.length
    ? `${t.biweekly ? "2週に1回 " : "毎週 "}${t.weekday.map((w) => WD[w]).join("・")}`
    : `${t.intervalDays}日おき`;
  const by = t.batchByWeekday && Object.keys(t.batchByWeekday).length
    ? WD_ORDER.filter((w) => t.batchByWeekday![w] != null).map((w) => `${WD[w]}${t.batchByWeekday![w]}`).join("・")
    : t.batch != null ? `${t.batch}` : "—";
  return { qty: `${by}${t.unit ?? ""}`, life: t.shelfLifeDays ? `${t.shelfLifeDays}日` : "—", sched };
};

function TaskForm({
  form,
  setForm,
}: {
  form: Form;
  setForm: (f: Form) => void;
}) {
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  return (
    <div className="tf">
      <label>名前</label>
      <input value={form.name} onChange={(e) => set("name", e.target.value)} />

      <div className="tf-row">
        <div>
          <label>1回の量</label>
          <input inputMode="decimal" value={form.batch} onChange={(e) => set("batch", e.target.value)} placeholder="例 300" />
        </div>
        <div>
          <label>単位</label>
          <input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="g・食・個" />
        </div>
        <div>
          <label>消費期限（日）</label>
          <input inputMode="numeric" value={form.shelfLifeDays} onChange={(e) => set("shelfLifeDays", e.target.value)} placeholder="例 7" />
        </div>
      </div>
      <label>量の補足（任意）</label>
      <input value={form.qty} onChange={(e) => set("qty", e.target.value)} placeholder="例 100gずつ冷凍" />

      <label>仕込む日</label>
      <div className="tf-seg" role="radiogroup">
        {(["interval", "weekday"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={form.mode === m}
            className={form.mode === m ? "on" : ""}
            onClick={() => set("mode", m)}
          >
            {m === "interval" ? "何日おき" : "曜日で決める"}
          </button>
        ))}
      </div>
      {form.mode === "interval" ? (
        <div className="tf-inline">
          <input inputMode="numeric" value={form.intervalDays} onChange={(e) => set("intervalDays", e.target.value)} style={{ width: 90 }} />
          <span>日おき（期限の日・切れた次の日のほうが早ければそちら）</span>
        </div>
      ) : (
        <>
          <div className="tf-wd">
            {WD_ORDER.map((w) => {
              const on = form.weekday.includes(w);
              return (
                <button
                  key={w}
                  type="button"
                  aria-pressed={on}
                  className={on ? "on" : ""}
                  onClick={() => set("weekday", on ? form.weekday.filter((x) => x !== w) : [...form.weekday, w])}
                >
                  {WD[w]}
                </button>
              );
            })}
          </div>
          <label className="tf-check">
            <input type="checkbox" checked={form.biweekly} onChange={(e) => set("biweekly", e.target.checked)} />
            2週に1回（A週だけ）
          </label>
          {form.weekday.length > 1 && (
            <>
              <label>曜日で量を変える（空欄は「1回の量」）</label>
              <div className="tf-row">
                {WD_ORDER.filter((w) => form.weekday.includes(w)).map((w) => (
                  <div key={w}>
                    <label>{WD[w]}曜</label>
                    <input
                      inputMode="decimal"
                      value={form.byWd[w] ?? ""}
                      onChange={(e) => set("byWd", { ...form.byWd, [w]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <label>材料</label>
      <textarea rows={2} value={form.materials} onChange={(e) => set("materials", e.target.value)} />
      <label>仕込み方（1行に1つの手順。仕込むときに画面に出ます）</label>
      <textarea
        rows={Math.min(10, Math.max(4, form.steps.split("\n").length + 1))}
        value={form.steps}
        onChange={(e) => set("steps", e.target.value)}
        placeholder={"例\nキャベツを千切りにして塩で揉む\n汁ごと容器に詰める"}
      />
      <label className="tf-check">
        <input type="checkbox" checked={form.stepsDraft} onChange={(e) => set("stepsDraft", e.target.checked)} />
        下書き（店のやり方をまだ確かめていない）
      </label>
      <label>メモ（保存の注意など）</label>
      <textarea rows={3} value={form.note} onChange={(e) => set("note", e.target.value)} />
      <div className="tf-row">
        <div>
          <label>所要時間（分）</label>
          <input inputMode="numeric" value={form.minutes} onChange={(e) => set("minutes", e.target.value)} />
        </div>
      </div>
      <style jsx>{`
        .tf { display: flex; flex-direction: column; gap: 4px; }
        .tf label { margin-top: 8px; }
        .tf-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; }
        .tf-inline { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
        .tf-seg { display: inline-flex; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; width: fit-content; }
        .tf-seg button { border: 0; background: var(--card); padding: 8px 14px; font: inherit; font-size: 13.5px; cursor: pointer; color: var(--ink); }
        .tf-seg button.on { background: var(--ink); color: #fff; font-weight: 700; }
        .tf-wd { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
        .tf-wd button {
          width: 40px; height: 40px; border-radius: 10px; border: 1px solid var(--line);
          background: var(--card); font: inherit; font-weight: 700; cursor: pointer; color: var(--ink);
        }
        .tf-wd button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
        .tf-check { display: flex; align-items: center; gap: 8px; font-size: 13.5px; }
        .tf-check input { width: auto; }
      `}</style>
    </div>
  );
}

export default function ShikomiSettingsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [defaults, setDefaults] = useState<Task[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(toForm());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/shikomi/settings");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "取得失敗");
      setTasks(j.tasks);
      setDefaults(j.defaults);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (body: unknown, done: string) => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/shikomi/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "保存に失敗");
      setMsg(done);
      setEditing(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗");
    } finally {
      setBusy(false);
    }
  };

  const open = (t: Task | null) => {
    setMsg("");
    if (!t) {
      setEditing("__new");
      setForm(toForm());
      return;
    }
    setEditing(editing === t.id ? null : t.id);
    setForm(toForm(t));
  };

  const save = (t: Task) => {
    const next = fromForm(form);
    if (!next.name) return setErr("名前を入れてください");
    const def = defaults.find((d) => d.id === t.id);
    // 初期値と同じ項目は null（初期値に戻す）、違う項目だけ保存する
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(next)) {
      const base = def ? (def as Record<string, unknown>)[k] : undefined;
      // 下書きの印は「無い」と「false」を同じに見る（チェックを外しただけで変更ありにならないように）
      const eq = k === "stepsDraft" ? !!v === !!base : same(v, base);
      patch[k] = def && eq ? null : v ?? null;
    }
    post({ id: t.id, patch }, `${next.name}を保存しました`);
  };

  const add = () => {
    const next = fromForm(form);
    if (!next.name) return setErr("名前を入れてください");
    post({ add: next }, `${next.name}を足しました`);
  };

  const visible = tasks.filter((t) => !t.hidden);
  const hidden = tasks.filter((t) => t.hidden);

  return (
    <div className="wrap">
      <header>
        <h1>仕込みの設定</h1>
        <p>1回の量・消費期限・仕込む日を変える</p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}
      {msg && <div className="card" style={{ padding: "10px 14px", fontWeight: 700, color: "var(--ok)" }}>✓ {msg}</div>}

      <p className="hint" style={{ margin: "0 0 10px" }}>
        ここで変えると、業務チェックの「今日の仕込み」と <Link href="/shikomi">仕込み</Link> の予定にすぐ反映されます。
        量は「決めた分だけ仕込む」ための数です。
      </p>

      {visible.map((t) => {
        const s = summary(t);
        const isOpen = editing === t.id;
        return (
          <div key={t.id} className="card st-card">
            <button type="button" className="st-head" onClick={() => open(t)} aria-expanded={isOpen}>
              <span className="st-name">
                {t.name}
                {t.isEdited && <span className="st-tag">変更あり</span>}
                {t.isAdded && <span className="st-tag">追加</span>}
              </span>
              <span className="st-meta">
                <span><em>量</em>{s.qty}</span>
                <span><em>期限</em>{s.life}</span>
                <span><em>予定</em>{s.sched}</span>
              </span>
            </button>
            {isOpen && (
              <div className="st-body">
                {t.openingTask && (
                  <p className="hint">この仕込みは業務チェックの残数チェックから出ます。量・期限は記録と分析に使います。</p>
                )}
                <TaskForm form={form} setForm={setForm} />
                <div className="st-actions">
                  <button className="primary" disabled={busy} onClick={() => save(t)}>{busy ? "保存中…" : "保存"}</button>
                  {t.isEdited && !t.isAdded && (
                    <button disabled={busy} onClick={() => confirm("この品目を初期値に戻しますか？") && post({ reset: t.id }, `${t.name}を初期値に戻しました`)}>
                      初期値に戻す
                    </button>
                  )}
                  {t.isAdded ? (
                    <button disabled={busy} onClick={() => confirm(`${t.name}を消しますか？（記録は残ります）`) && post({ reset: t.id }, `${t.name}を消しました`)}>
                      消す
                    </button>
                  ) : (
                    <button disabled={busy} onClick={() => post({ id: t.id, patch: { hidden: true } }, `${t.name}を一覧から外しました`)}>
                      一覧から外す
                    </button>
                  )}
                  <button disabled={busy} onClick={() => setEditing(null)}>閉じる</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {editing === "__new" ? (
        <div className="card st-card">
          <div className="st-body">
            <div className="cat-title">仕込み品を足す</div>
            <TaskForm form={form} setForm={setForm} />
            <div className="st-actions">
              <button className="primary" disabled={busy} onClick={add}>{busy ? "保存中…" : "足す"}</button>
              <button disabled={busy} onClick={() => setEditing(null)}>やめる</button>
            </div>
          </div>
        </div>
      ) : (
        <button className="st-add" onClick={() => open(null)}>＋ 仕込み品を足す</button>
      )}

      {hidden.length > 0 && (
        <div className="card" style={{ padding: "12px 14px" }}>
          <div className="cat-title">一覧から外したもの</div>
          {hidden.map((t) => (
            <div key={t.id} className="result-row" style={{ fontSize: 13.5 }}>
              <span>{t.name}</span>
              <button disabled={busy} onClick={() => post({ id: t.id, patch: { hidden: null } }, `${t.name}を一覧に戻しました`)}>
                戻す
              </button>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .st-card { padding: 0; overflow: hidden; }
        .st-head {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 13px 14px;
          border: 0;
          background: none;
          font: inherit;
          text-align: left;
          cursor: pointer;
          color: var(--ink);
        }
        .st-head:hover { background: #faf8f4; }
        .st-head:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
        .st-name { font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .st-tag { font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: var(--accent-weak); color: #8a4a14; }
        .st-meta { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; font-variant-numeric: tabular-nums; }
        .st-meta em { font-style: normal; color: var(--muted); font-size: 11.5px; margin-right: 5px; }
        .st-body { padding: 4px 14px 14px; border-top: 1px solid var(--line); }
        .st-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
        .st-add {
          width: 100%;
          padding: 13px;
          border: 1px dashed var(--line);
          border-radius: 12px;
          background: transparent;
          font: inherit;
          font-weight: 700;
          color: var(--accent);
          cursor: pointer;
          margin-bottom: 12px;
        }
        .st-add:hover { background: var(--accent-weak); }
      `}</style>
    </div>
  );
}
