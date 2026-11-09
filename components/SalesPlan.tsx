"use client";

// 売上計画。その月の目標と、日ごとの目標（今月の成績の dayTargets）、実績を1枚に並べる。
// 画面（/keikaku）と、PDFにするための印刷ページ（/keikaku/print）で同じものを出す。
// 2026-11-09 坂本さん「売上計画が見れるタブを作って。その月の売上計画はPDFで出力できるように」

import { useEffect, useState } from "react";

type DayTarget = { store: number; event?: number; label?: string; closed?: boolean };
type Seiseki = {
  month: string;
  today: string;
  target: number;
  needPerDay?: number;
  forecast?: { sales: number };
  sales: {
    total: number;
    byDay: { day: string; sales: number; count: number }[];
    square: number;
    uber?: { total: number };
    events?: { total: number; list: { date: string; label: string; amount: number }[] };
  };
  settings: { dayTargets?: Record<string, DayTarget> };
};

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const WD = ["日", "月", "火", "水", "木", "金", "土"];

export function useSeiseki(month: string) {
  const [data, setData] = useState<Seiseki | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    setData(null);
    setErr("");
    fetch(`/api/seiseki?month=${month}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "読めませんでした");
        if (alive) setData(d);
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : "読めませんでした"));
    return () => { alive = false; };
  }, [month]);
  return { data, err };
}

export default function SalesPlan({ data, print = false }: { data: Seiseki; print?: boolean }) {
  const [y, m] = data.month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = Array.from({ length: last }, (_, i) => `${data.month}-${String(i + 1).padStart(2, "0")}`);
  const targets = data.settings.dayTargets ?? {};
  const actual = Object.fromEntries(data.sales.byDay.map((d) => [d.day, d.sales]));
  const today = data.today;

  const rows = days.map((d) => {
    const t = targets[d];
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    const goal = t && !t.closed ? t.store + (t.event ?? 0) : 0;
    const done = d < today || (d === today && actual[d] !== undefined);
    return { d, wd, t, goal, act: actual[d] ?? 0, done, past: d < today };
  });
  const goalSum = rows.reduce((s, r) => s + r.goal, 0);
  const storeSum = rows.reduce((s, r) => s + (r.t && !r.t.closed ? r.t.store : 0), 0);
  const eventSum = goalSum - storeSum;
  const actSum = data.sales.total;
  const goalToDate = rows.filter((r) => r.d <= today).reduce((s, r) => s + r.goal, 0);
  const hasTargets = Object.keys(targets).some((d) => d.startsWith(data.month));
  const labels = [...new Set(rows.filter((r) => r.t?.label).map((r) => `${Number(r.d.slice(8))}日 ${r.t!.label}`))];

  const cell: React.CSSProperties = { padding: print ? "3px 6px" : "6px 8px", borderBottom: "1px solid #e6e1d9", textAlign: "right", whiteSpace: "nowrap" };
  const tile: React.CSSProperties = { border: "1px solid #e6e1d9", borderRadius: 8, padding: "10px 12px", display: "grid", gap: 2, minWidth: 0 };

  return (
    <div style={{ display: "grid", gap: print ? 10 : 16, fontVariantNumeric: "tabular-nums" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: print ? 20 : 22 }}>{y}年{m}月の売上計画</h2>
        <span style={{ fontSize: 12, color: "#7a756c" }}>{today.slice(5).replace("-", "/")} 時点</span>
      </div>

      {/* まとめ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        <div style={tile}>
          <span style={{ fontSize: 12, color: "#7a756c" }}>月の目標</span>
          <strong style={{ fontSize: 20 }}>{yen(data.target)}</strong>
          {hasTargets && <span style={{ fontSize: 11.5, color: "#7a756c" }}>日ごとの目標の合計 {yen(goalSum)}（店 {yen(storeSum)}・店の外 {yen(eventSum)}）</span>}
        </div>
        <div style={tile}>
          <span style={{ fontSize: 12, color: "#7a756c" }}>いまの実績</span>
          <strong style={{ fontSize: 20 }}>{yen(actSum)}</strong>
          <span style={{ fontSize: 11.5, color: "#7a756c" }}>
            目標の {data.target > 0 ? Math.round((actSum / data.target) * 100) : 0}%
            {hasTargets && ` ／ 今日までの目標 ${yen(goalToDate)}（差 ${actSum - goalToDate >= 0 ? "+" : "−"}${yen(Math.abs(actSum - goalToDate))}）`}
          </span>
        </div>
        {data.forecast && (
          <div style={tile}>
            <span style={{ fontSize: 12, color: "#7a756c" }}>このままの月末見込み</span>
            <strong style={{ fontSize: 20 }}>{yen(data.forecast.sales)}</strong>
            <span style={{ fontSize: 11.5, color: "#7a756c" }}>これまでのペース＋予定のイベント</span>
          </div>
        )}
        {data.needPerDay != null && data.needPerDay > 0 && (
          <div style={tile}>
            <span style={{ fontSize: 12, color: "#7a756c" }}>目標まで 1日あたり</span>
            <strong style={{ fontSize: 20 }}>{yen(data.needPerDay)}</strong>
            <span style={{ fontSize: 11.5, color: "#7a756c" }}>残りの営業日で割った額</span>
          </div>
        )}
      </div>

      {labels.length > 0 && (
        <div style={{ fontSize: 12.5 }}>
          <strong>イベント・特別な日：</strong>{labels.join("、")}
        </div>
      )}

      {/* 日ごとの表 */}
      {hasTargets ? (
        <div style={{ overflowX: "auto", border: "1px solid #e6e1d9", borderRadius: 8 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: print ? 11 : 13 }}>
            <thead>
              <tr style={{ background: "#f6f3ee", color: "#5f5950" }}>
                <th style={{ ...cell, textAlign: "left" }}>日</th>
                <th style={{ ...cell, textAlign: "left" }}>中身</th>
                <th style={cell}>店の目標</th>
                <th style={cell}>店の外</th>
                <th style={cell}>目標</th>
                <th style={cell}>実績</th>
                <th style={cell}>差</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const closed = !r.t || r.t.closed;
                const diff = r.act - r.goal;
                const isToday = r.d === today;
                return (
                  <tr key={r.d} style={{ background: isToday ? "#fdf1e6" : closed ? "#faf9f7" : undefined, color: closed ? "#9a938a" : undefined }}>
                    <td style={{ ...cell, textAlign: "left", fontWeight: 700, color: r.wd === 0 ? "#b23a2c" : r.wd === 6 ? "#2a5db0" : undefined }}>
                      {Number(r.d.slice(5, 7))}/{Number(r.d.slice(8))}（{WD[r.wd]}）{isToday ? " 今日" : ""}
                    </td>
                    <td style={{ ...cell, textAlign: "left", whiteSpace: "normal" }}>{closed ? (r.t?.closed ? "休み" : "—") : r.t?.label ?? ""}</td>
                    <td style={cell}>{closed ? "" : yen(r.t!.store)}</td>
                    <td style={cell}>{closed || !r.t!.event ? "" : yen(r.t!.event)}</td>
                    <td style={{ ...cell, fontWeight: 700 }}>{closed ? "" : yen(r.goal)}</td>
                    <td style={cell}>{r.past || (isToday && r.act) ? yen(r.act) : ""}</td>
                    <td style={{ ...cell, color: !r.past || closed ? undefined : diff >= 0 ? "#1e7b3c" : "#b23a2c", fontWeight: 700 }}>
                      {r.past && !closed ? `${diff >= 0 ? "+" : "−"}${yen(Math.abs(diff))}` : ""}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: "#f6f3ee", fontWeight: 800 }}>
                <td style={{ ...cell, textAlign: "left" }}>合計</td>
                <td style={cell} />
                <td style={cell}>{yen(storeSum)}</td>
                <td style={cell}>{eventSum ? yen(eventSum) : ""}</td>
                <td style={cell}>{yen(goalSum)}</td>
                <td style={cell}>{yen(actSum)}</td>
                <td style={cell} />
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "#7a756c" }}>この月はまだ日ごとの目標が入っていません。月の目標だけ出しています。</div>
      )}
      <div style={{ fontSize: 11, color: "#7a756c" }}>
        実績は店（Square＋Uber Eats）と、freee に記帳した店の外の出店の合計。店の外の出店は記帳した日から入ります。
      </div>
    </div>
  );
}
