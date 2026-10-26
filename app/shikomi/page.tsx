"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";

// 仕込みの予定と記録（内部用）。店に来たときに何を仕込むかが分かることが目的。
// 「仕込んだ日＋消費期限」「切れた次の日」「決まった曜日」のうち早い日に出る。
// 量は決めた分だけ仕込み、予定より早く切れた回は下の分析で見る。

type DoneLog = { taskId: string; date: string; type?: "made" | "out"; qty?: number; note?: string; by?: string };
type State = {
  id: string;
  name: string;
  kind: string;
  intervalDays: number;
  shelfLifeDays?: number;
  weekday?: number[];
  biweekly?: boolean;
  materials?: string;
  note?: string;
  minutes?: number;
  lastDate: string | null;
  daysSince: number | null;
  expiresOn: string | null;
  outOn: string | null;
  nextDate: string | null;
  daysUntil: number | null;
  status: "overdue" | "today" | "soon" | "ok" | "never";
  dueReasons: { reason: string; text: string }[];
  todayBatch: string;
  doneToday: boolean;
  outToday: boolean;
  history: DoneLog[];
};
type Cycle = {
  from: string; to: string; actualDays: number; plannedDays: number; earlyDays: number;
  trigger: string; qty?: number;
};
type Analysis = {
  id: string; name: string; unit?: string; plannedDays: number; cycles: Cycle[];
  avgActualDays: number | null; avgEarlyDays: number | null; outCount: number; expireCount: number;
  perDay: number | null; advice: string;
};

const LABEL: Record<string, { text: string; color: string }> = {
  never: { text: "未実施", color: "#c0392b" },
  overdue: { text: "超過", color: "#c0392b" },
  today: { text: "今日", color: "#b5651d" },
  soon: { text: "明日", color: "#b5651d" },
  ok: { text: "余裕あり", color: "var(--muted)" },
};
const WD = ["日", "月", "火", "水", "木", "金", "土"];
const md = (d: string | null) => (d ? d.slice(5).replace("-", "/") : "");

export default function ShikomiPage() {
  const [d, setD] = useState<{
    today: string;
    states: State[];
    due: State[];
    analysis: Analysis[];
    summary: { due: number; dueMinutes: number; doneToday: number };
  } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/shikomi");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "取得失敗");
      setD(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const record = async (taskId: string, type: "made" | "out") => {
    setBusy(`${taskId}:${type}`);
    try {
      await fetch("/api/shikomi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, type }),
      });
      await load();
    } finally {
      setBusy("");
    }
  };

  const undo = async (taskId: string, date: string, type: "made" | "out") => {
    setBusy(`${taskId}:${type}`);
    try {
      await fetch(`/api/shikomi?taskId=${taskId}&date=${date}&type=${type}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy("");
    }
  };

  const schedule = (s: State) =>
    s.weekday?.length
      ? `${s.biweekly ? "2週に1回（A週）" : "毎週"}${s.weekday.map((w) => WD[w]).join("・")}曜`
      : `${s.intervalDays}日おき`;

  return (
    <div className="wrap">
      <header>
        <h1>📆 仕込み</h1>
        <p>仕込みの予定・記録と、予定とのずれ　<Link href="/shikomi/settings">設定を変える →</Link></p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}

      {d && (
        <div className="card total-card">
          <div className="total-label">今日仕込むもの（{md(d.today)}）</div>
          <div className="total-amount">{d.summary.due}件</div>
          {d.summary.dueMinutes > 0 && (
            <div style={{ marginTop: 6, fontSize: 12.5, opacity: 0.85 }}>
              目安 約{d.summary.dueMinutes}分
              {d.summary.doneToday > 0 && ` ／ 完了 ${d.summary.doneToday}件`}
            </div>
          )}
        </div>
      )}

      {d?.due.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 18 }}>
          <strong>今日仕込むものはありません 🎉</strong>
        </div>
      )}

      {(d?.states ?? []).map((s) => {
        const due = s.dueReasons.length > 0 && !s.doneToday;
        const lab = LABEL[s.status];
        const isOpen = open === s.id;
        const prep = s.kind === "仕込み";
        return (
          <div
            key={s.id}
            className="card"
            style={{
              padding: "12px 14px",
              borderLeft: `3px solid ${s.doneToday ? "#3f7d58" : due ? "#c0392b" : lab.color}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{s.kind}</div>
                <strong style={{ fontSize: 15 }}>{s.name}</strong>
                {prep && (
                  <div style={{ fontSize: 12.5, marginTop: 3 }}>
                    <span style={{ fontWeight: 700, color: "#9c5f22" }}>1回 {s.todayBatch || "—"}</span>
                    {s.shelfLifeDays && <>　消費期限 {s.shelfLifeDays}日</>}
                    {"　"}予定 {schedule(s)}
                  </div>
                )}
                {s.materials && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>材料 {s.materials}</div>
                )}
                {s.note && (
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{s.note}</div>
                )}
                <div style={{ fontSize: 12, marginTop: 5 }}>
                  {s.doneToday ? (
                    <span style={{ color: "#3f7d58", fontWeight: 700 }}>✅ 今日仕込みました</span>
                  ) : due ? (
                    <span style={{ color: "#c0392b", fontWeight: 700 }}>
                      今日仕込む（{s.dueReasons.map((r) => r.text).join("・")}）
                    </span>
                  ) : (
                    <span style={{ color: lab.color, fontWeight: 700 }}>
                      次は {md(s.nextDate) || "—"}
                      {s.daysUntil !== null && s.daysUntil > 0 && `（あと${s.daysUntil}日）`}
                    </span>
                  )}
                  <span style={{ color: "var(--muted)" }}>
                    {"　"}
                    {s.lastDate ? `前回 ${md(s.lastDate)}（${s.daysSince}日前）` : "記録なし"}
                    {s.expiresOn && ` ／ 期限 ${md(s.expiresOn)}`}
                    {s.outOn && ` ／ ${md(s.outOn)}に切れた`}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                {s.doneToday ? (
                  <button onClick={() => undo(s.id, d!.today, "made")} disabled={!!busy} style={{ fontSize: 11 }}>
                    取消
                  </button>
                ) : (
                  <button
                    className="primary"
                    onClick={() => record(s.id, "made")}
                    disabled={!!busy}
                    style={{ fontSize: 12, whiteSpace: "nowrap" }}
                  >
                    {busy === `${s.id}:made` ? "…" : prep ? "仕込んだ" : "やった"}
                  </button>
                )}
                {prep && s.lastDate && (
                  <button
                    onClick={() => (s.outToday ? undo(s.id, d!.today, "out") : record(s.id, "out"))}
                    disabled={!!busy}
                    style={{
                      fontSize: 11, whiteSpace: "nowrap",
                      ...(s.outToday ? { background: "#c0392b", color: "#fff", borderColor: "#c0392b" } : {}),
                    }}
                  >
                    {busy === `${s.id}:out` ? "…" : s.outToday ? "✕ 切れた" : "切れた"}
                  </button>
                )}
                {s.history.length > 0 && (
                  <button onClick={() => setOpen(isOpen ? null : s.id)} style={{ fontSize: 11 }}>
                    履歴
                  </button>
                )}
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 8, borderTop: "1px solid var(--line-soft, #eee)", paddingTop: 6 }}>
                {s.history.map((h, i) => (
                  <div key={i} className="result-row" style={{ fontSize: 12 }}>
                    <span>
                      <span className="mono">{h.date}</span>
                      <span style={{ marginLeft: 8, color: h.type === "out" ? "#c0392b" : "var(--ok)", fontWeight: 700 }}>
                        {h.type === "out" ? "切れた" : "仕込んだ"}
                      </span>
                      {h.qty !== undefined && <span style={{ marginLeft: 6 }}>{h.qty}</span>}
                    </span>
                    <button onClick={() => undo(s.id, h.date, h.type === "out" ? "out" : "made")} style={{ fontSize: 10.5 }}>
                      削除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {d && (
        <div className="card" style={{ padding: "12px 14px" }}>
          <div className="cat-title">📊 予定とのずれ（仕込みが何日早まっているか）</div>
          <p className="hint" style={{ margin: "4px 0 8px" }}>
            仕込んでから次に仕込むまでの日数を、本来の予定と比べています。「切れた」を押した回は、量が足りなかった回として数えます。
          </p>
          {d.analysis.map((a) => (
            <div key={a.id} style={{ padding: "9px 2px", borderTop: "1px solid var(--line-soft, #eee)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 13.5 }}>{a.name}</strong>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  予定 {a.plannedDays}日
                  {a.avgActualDays !== null && ` ／ 実際 平均${a.avgActualDays}日`}
                  {a.avgEarlyDays !== null && a.avgEarlyDays !== 0 && (
                    <strong style={{ color: a.avgEarlyDays > 0 ? "#c0392b" : "var(--muted)", marginLeft: 4 }}>
                      {a.avgEarlyDays > 0 ? `${a.avgEarlyDays}日早い` : `${-a.avgEarlyDays}日遅い`}
                    </strong>
                  )}
                </span>
              </div>
              <div style={{ fontSize: 12, marginTop: 3 }}>
                {a.cycles.length > 0 && (
                  <span style={{ color: "var(--muted)" }}>
                    {a.cycles.length}回分 ／ 切れた {a.outCount}回 ／ 期限 {a.expireCount}回
                    {a.perDay !== null && ` ／ 1日 約${a.perDay}${a.unit ?? ""}使う`}
                    {"　"}
                  </span>
                )}
                <span style={{ fontWeight: 700 }}>{a.advice}</span>
              </div>
              {a.cycles.length > 0 && (
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.7 }}>
                  {a.cycles.slice(0, 5).map((c) => (
                    <div key={c.from}>
                      {md(c.from)}→{md(c.to)}　{c.actualDays}日（予定{c.plannedDays}日）
                      <span style={{ marginLeft: 6, color: c.trigger === "切れた" ? "#c0392b" : undefined }}>{c.trigger}</span>
                      {c.earlyDays > 0 && `・${c.earlyDays}日早い`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>
        ※ 業務チェックの「今日の仕込み」「切れた仕込み品を記録する」と同じ記録です。<br />
        消費期限・1回の量・仕込む日は <Link href="/shikomi/settings">仕込みの設定</Link> で変えられます。
      </p>
    </div>
  );
}
