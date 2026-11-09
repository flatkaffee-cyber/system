"use client";

// 分析ページの「グラフ」。商品を選んで、縦軸（個数・売上）と横軸（月・週・曜日）を切り替えて見る。
// 2026-11-09 坂本さん「売れてる・売れてないをMTGで検討したい。一覧だと見づらい」から作った。
//
// 色は dataviz の既定の6色（色覚の見分けチェック済み）。薄い色があるので、下に数字の表を必ず出す。
// 選んだ順に色を固定する（外しても、残った商品の色は変えない）。

import { useMemo, useState } from "react";

export type ChartProduct = {
  name: string;
  qty: number;
  amount: number;
  category: string;
  /** [日, 数, 売上] */
  days: [string, number, number][];
};

const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6"];
const MAX = COLORS.length;
const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

type XMode = "month" | "week" | "weekday";
type YMode = "qty" | "amount";

const fmtYen = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const fmtNum = (n: number, per: boolean) => (per ? (Math.round(n * 10) / 10).toLocaleString() : Math.round(n).toLocaleString());

/** その日の週の月曜（YYYY-MM-DD） */
function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7; // 月=0
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 日付 → 横軸の区切り */
function bucketOf(day: string, x: XMode): string {
  if (x === "month") return day.slice(0, 7);
  if (x === "week") return mondayOf(day);
  return String((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7); // 月=0 … 日=6
}
function labelOf(key: string, x: XMode): string {
  if (x === "month") return `${Number(key.slice(5))}月`;
  if (x === "week") return `${md(key)}週`;
  return WEEKDAYS[Number(key)];
}

/** きれいな目盛り（0から始める） */
function ticks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

export default function ProductChart({
  products,
  variants = [],
  openDays,
}: {
  products: ChartProduct[];
  /** 種類（フレーバー）ごと。名前は「ワッフル（チョコ）」の形 */
  variants?: (ChartProduct & { parent?: string; variant?: string })[];
  /** 営業した日（売上のあった日）。1日あたりを出すのに使う */
  openDays: string[];
}) {
  const sellable = useMemo(
    () => products.filter((p) => p.name !== "不明").sort((a, b) => b.amount - a.amount),
    [products],
  );
  // 種類ごとも選べるようにする（ワッフルのチョコ・抹茶など）。「種類が分からない」は比べても意味がないので出さない
  const flavors = useMemo(
    () => variants.filter((v) => v.variant !== "種類が分からない").sort((a, b) => b.qty - a.qty),
    [variants],
  );
  const pool = useMemo(() => [...sellable, ...flavors], [sellable, flavors]);
  const [picked, setPicked] = useState<string[]>(() => sellable.slice(0, 3).map((p) => p.name));
  const [x, setX] = useState<XMode>("month");
  const [y, setY] = useState<YMode>("qty");
  const [perDay, setPerDay] = useState(true);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<number | null>(null);

  // 色は選んだ時に決めて、外しても他の色は動かさない
  const [colorOf, setColorOf] = useState<Record<string, string>>(() =>
    Object.fromEntries(sellable.slice(0, 3).map((p, i) => [p.name, COLORS[i]])),
  );
  const toggle = (name: string) => {
    if (picked.includes(name)) {
      setPicked(picked.filter((n) => n !== name));
      setColorOf((c) => {
        const n = { ...c };
        delete n[name];
        return n;
      });
      return;
    }
    if (picked.length >= MAX) return;
    const used = new Set(Object.values(colorOf));
    const color = COLORS.find((c) => !used.has(c)) ?? COLORS[0];
    setPicked([...picked, name]);
    setColorOf((c) => ({ ...c, [name]: color }));
  };

  // 横軸の区切りと、その区切りの営業日数
  const { keys, openIn } = useMemo(() => {
    const openIn: Record<string, number> = {};
    for (const d of openDays) {
      const k = bucketOf(d, x);
      openIn[k] = (openIn[k] ?? 0) + 1;
    }
    let keys = Object.keys(openIn).sort();
    if (x === "weekday") keys = ["0", "1", "2", "3", "4", "5", "6"].filter((k) => openIn[k]);
    return { keys, openIn };
  }, [openDays, x]);

  const series = useMemo(
    () =>
      picked
        .map((name) => pool.find((p) => p.name === name))
        .filter((p): p is ChartProduct => !!p)
        .map((p) => {
          const sum: Record<string, number> = {};
          for (const [d, q, a] of p.days) {
            const k = bucketOf(d, x);
            sum[k] = (sum[k] ?? 0) + (y === "qty" ? q : a);
          }
          const values = keys.map((k) => {
            const v = sum[k] ?? 0;
            return perDay ? (openIn[k] ? v / openIn[k] : 0) : v;
          });
          return { name: p.name, color: colorOf[p.name] ?? COLORS[0], values };
        }),
    [picked, pool, keys, openIn, x, y, perDay, colorOf],
  );

  const maxV = Math.max(0, ...series.flatMap((s) => s.values));
  const yt = ticks(maxV);
  const yMax = yt[yt.length - 1] || 1;

  // 描く場所
  const W = 640;
  const H = 280;
  const pad = { l: 52, r: 14, t: 14, b: 34 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = keys.length;
  const colW = n > 0 ? iw / n : iw;
  const cx = (i: number) => pad.l + colW * (i + 0.5);
  const sy = (v: number) => pad.t + ih - (v / yMax) * ih;
  const bars = x === "weekday";
  const fmtV = (v: number) => (y === "amount" ? fmtYen(v) : `${fmtNum(v, perDay)}個`);
  const yLabel = `${y === "qty" ? "個数" : "売上"}${perDay ? "（1日あたり）" : "（合計）"}`;
  // 週は区切りが多いので、ラベルは間引く
  const labelEvery = n > 12 ? Math.ceil(n / 8) : 1;

  const list = sellable.filter((p) => !query || p.name.includes(query));
  const flavorList = flavors.filter((p) => !query || p.name.includes(query));

  const seg = (on: boolean) => ({
    flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
    border: on ? "2px solid var(--accent)" : "1px solid var(--line)",
    background: on ? "var(--accent-weak)" : "var(--card)", color: "var(--ink)",
  });

  return (
    <div>
      {/* 切り替え。縦軸・横軸・合計か1日あたりか */}
      <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--muted)", width: 36 }}>縦軸</span>
          <button style={seg(y === "qty")} onClick={() => setY("qty")}>個数</button>
          <button style={seg(y === "amount")} onClick={() => setY("amount")}>売上</button>
          <button style={seg(!perDay)} onClick={() => setPerDay(false)}>合計</button>
          <button style={seg(perDay)} onClick={() => setPerDay(true)}>1日あたり</button>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--muted)", width: 36 }}>横軸</span>
          <button style={seg(x === "month")} onClick={() => setX("month")}>月</button>
          <button style={seg(x === "week")} onClick={() => setX("week")}>週</button>
          <button style={seg(x === "weekday")} onClick={() => setX("weekday")}>曜日</button>
        </div>
      </div>

      {/* 選んだ商品（凡例をかねる） */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {series.length === 0 && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>下の一覧から商品を選んでください（{MAX}つまで）</span>}
        {series.map((s) => (
          <button
            key={s.name}
            onClick={() => toggle(s.name)}
            title="もう一度押すと外します"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 99,
              border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)",
              fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 99, background: s.color }} />
            {s.name}
            <span style={{ color: "var(--muted)", fontWeight: 400 }}>×</span>
          </button>
        ))}
      </div>

      {/* グラフ */}
      <div style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${series.map((s) => s.name).join("・")}の${yLabel}`}
          style={{ display: "block", width: "100%", height: "auto", touchAction: "manipulation" }}
          onMouseLeave={() => setHover(null)}
        >
          {/* 目盛り */}
          {yt.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={W - pad.r} y1={sy(v)} y2={sy(v)} stroke="#e8e4dc" strokeWidth={1} />
              <text x={pad.l - 6} y={sy(v) + 4} textAnchor="end" fontSize={11} fill="#7a756c">
                {y === "amount" ? (v >= 10000 ? `${v / 10000}万` : v.toLocaleString()) : fmtNum(v, true)}
              </text>
            </g>
          ))}
          {keys.map((k, i) =>
            i % labelEvery === 0 ? (
              <text key={k} x={cx(i)} y={H - pad.b + 18} textAnchor="middle" fontSize={11} fill="#7a756c">
                {labelOf(k, x)}
              </text>
            ) : null,
          )}

          {/* ホバーの縦線 */}
          {hover !== null && !bars && (
            <line x1={cx(hover)} x2={cx(hover)} y1={pad.t} y2={pad.t + ih} stroke="#b9b3a8" strokeWidth={1} />
          )}
          {hover !== null && bars && (
            <rect x={pad.l + colW * hover} y={pad.t} width={colW} height={ih} fill="#f3efe8" />
          )}

          {bars
            ? // 曜日は棒。商品ごとに並べ、棒どうしに2pxのすき間
              series.map((s, si) => {
                const groupW = colW * 0.78;
                const bw = Math.max(3, (groupW - 2 * (series.length - 1)) / Math.max(1, series.length));
                return s.values.map((v, i) => {
                  const x0 = pad.l + colW * i + (colW - groupW) / 2 + si * (bw + 2);
                  const h = Math.max(0, pad.t + ih - sy(v));
                  const r = Math.min(4, bw / 2, h);
                  const top = pad.t + ih - h;
                  // 上の角だけ丸くする
                  const d = h <= 0 ? "" : `M${x0},${pad.t + ih} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${pad.t + ih} Z`;
                  return d ? <path key={`${s.name}-${i}`} d={d} fill={s.color} /> : null;
                });
              })
            : // 月・週は線
              series.map((s) => (
                <g key={s.name}>
                  <polyline
                    points={s.values.map((v, i) => `${cx(i)},${sy(v)}`).join(" ")}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {s.values.map((v, i) => (
                    <circle
                      key={i}
                      cx={cx(i)}
                      cy={sy(v)}
                      r={hover === i ? 5 : n > 16 ? 0 : 4}
                      fill={s.color}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ))}
                </g>
              ))}

          {/* 当たり判定は列ごと（点より大きく） */}
          {keys.map((k, i) => (
            <rect
              key={k}
              x={pad.l + colW * i}
              y={pad.t}
              width={colW}
              height={ih}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onClick={() => setHover(hover === i ? null : i)}
              style={{ cursor: "pointer" }}
            />
          ))}
        </svg>

        {/* ホバーの中身 */}
        {hover !== null && series.length > 0 && (
          <div
            style={{
              position: "absolute", top: 6,
              ...(cx(hover) / W > 0.55 ? { right: `${((W - cx(hover)) / W) * 100 + 2}%` } : { left: `${(cx(hover) / W) * 100 + 2}%` }),
              background: "#fff", border: "1px solid var(--line)", borderRadius: 8,
              padding: "8px 10px", fontSize: 12, boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
              pointerEvents: "none", minWidth: 150, zIndex: 2,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {labelOf(keys[hover], x)}
              <span style={{ color: "var(--muted)", fontWeight: 400, marginLeft: 6 }}>営業 {openIn[keys[hover]] ?? 0}日</span>
            </div>
            {[...series]
              .sort((a, b) => b.values[hover] - a.values[hover])
              .map((s) => (
                <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "1px 0" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: s.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{fmtV(s.values[hover])}</span>
                </div>
              ))}
          </div>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
        縦軸：{yLabel}。{perDay ? "その区切りの営業日の数で割っています（営業日の数が違う月・曜日も比べられる）。" : ""}
        グラフの上を押すと、その時の数字が出ます。
      </div>

      {/* 数字の表（色だけで見分けなくていいように） */}
      {series.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid var(--line)", position: "sticky", left: 0, background: "var(--card)" }}>商品</th>
                {keys.map((k) => (
                  <th key={k} style={{ textAlign: "right", padding: "4px 8px", borderBottom: "1px solid var(--line)", fontWeight: 600 }}>{labelOf(k, x)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.name}>
                  <td style={{ padding: "4px 8px", borderBottom: "1px solid var(--line)", position: "sticky", left: 0, background: "var(--card)" }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: s.color, marginRight: 6 }} />
                    {s.name}
                  </td>
                  {s.values.map((v, i) => (
                    <td key={i} style={{ textAlign: "right", padding: "4px 8px", borderBottom: "1px solid var(--line)" }}>
                      {y === "amount" ? fmtYen(v) : fmtNum(v, perDay)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 商品を選ぶ */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <strong style={{ fontSize: 13 }}>商品を選ぶ</strong>
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{picked.length}/{MAX}（売上の多い順）</span>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="商品名で探す"
          style={{ marginBottom: 8, padding: "8px 10px", fontSize: 14 }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 220, overflowY: "auto" }}>
          {list.map((p) => {
            const on = picked.includes(p.name);
            const full = !on && picked.length >= MAX;
            return (
              <button
                key={p.name}
                onClick={() => toggle(p.name)}
                disabled={full}
                style={{
                  padding: "5px 10px", borderRadius: 99, fontSize: 12.5, cursor: full ? "not-allowed" : "pointer",
                  border: on ? `2px solid ${colorOf[p.name]}` : "1px solid var(--line)",
                  background: on ? "var(--accent-weak)" : "var(--card)", color: "var(--ink)",
                  opacity: full ? 0.45 : 1, fontWeight: on ? 700 : 400,
                }}
              >
                {p.name}
                <span style={{ color: "var(--muted)", marginLeft: 4, fontWeight: 400 }}>{p.qty}個</span>
              </button>
            );
          })}
        </div>
        {flavorList.length > 0 && (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 700, margin: "12px 0 6px" }}>種類（フレーバー）ごと</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 180, overflowY: "auto" }}>
              {flavorList.map((p) => {
                const on = picked.includes(p.name);
                const full = !on && picked.length >= MAX;
                return (
                  <button
                    key={p.name}
                    onClick={() => toggle(p.name)}
                    disabled={full}
                    style={{
                      padding: "5px 10px", borderRadius: 99, fontSize: 12.5, cursor: full ? "not-allowed" : "pointer",
                      border: on ? `2px solid ${colorOf[p.name]}` : "1px solid var(--line)",
                      background: on ? "var(--accent-weak)" : "var(--card)", color: "var(--ink)",
                      opacity: full ? 0.45 : 1, fontWeight: on ? 700 : 400,
                    }}
                  >
                    {p.name}
                    <span style={{ color: "var(--muted)", marginLeft: 4, fontWeight: 400 }}>{p.qty}個</span>
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>11/9より前のカード会計は種類が残っていないので、種類ごとの数は実際より少なめです。</div>
          </>
        )}
      </div>
    </div>
  );
}
