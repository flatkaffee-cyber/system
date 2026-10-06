"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";

// 月次レポート。freeeの実績を
//   ① 通常営業の実力 → ② 臨時・不定期（イベント／一度きり）→ ③ この月の成績
// の順に見せる。最後にアルバイトを入れたときの試算を置く。

type Bucket = "regular" | "event" | "irregular";
type Line = {
  key: string;
  source: string;
  date: string;
  account: string;
  amount: number;
  description: string;
  tags: string[];
  auto: Bucket;
  bucket: Bucket;
  reason: string;
};
type Data = {
  month: string;
  period: { from: string; to: string; days: number };
  settings: { wage: number; nightRate: number };
  eventLabels: string[];
  regular: {
    sales: number;
    salesBy: { label: string; amount: number }[];
    cogs: number;
    cogsRate: number;
    expenses: { account: string; amount: number }[];
    otherExpense: number;
    beforeLabor: number;
    labor: { label: string; amount: number; estimate: boolean }[];
    laborTotal: number;
    profit: number;
  };
  event: { total: number };
  irregular: { total: number };
  final: number;
  offBook: { date: string; label: string; amount: number }[];
  lines: Line[];
  shift: { days: number; dayHours: number; nightHours: number; byStaff: { staff: string; day: number; night: number }[] };
  bizDays: number;
  hourly: { hour: number; avgSales: number }[];
  error?: string;
};

const fmt = (n: number) => `${n < 0 ? "−" : ""}¥${Math.abs(Math.round(n)).toLocaleString()}`;
const signed = (n: number) => `${n > 0 ? "+" : ""}${fmt(n)}`;
const prevMonth = () => {
  const d = new Date(Date.now() + 9 * 3600_000);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};
const BUCKET_LABEL: Record<Bucket, string> = { regular: "通常営業", event: "イベント", irregular: "臨時" };

export default function Monthly() {
  const [month, setMonth] = useState(prevMonth());
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // 試算の入力
  const [wage, setWage] = useState(1200);
  const [night, setNight] = useState(25);
  const [hours, setHours] = useState(52);

  const load = useCallback(async (m: string) => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/monthly-report?month=${m}`, { cache: "no-store" });
      const j = (await res.json()) as Data;
      if (!res.ok) throw new Error(j.error || "読み込みに失敗しました");
      setD(j);
      setWage(j.settings.wage);
      setNight(Math.round(j.settings.nightRate * 100));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    load(month);
  }, [month, load]);

  async function move(key: string, bucket: Bucket, auto: Bucket) {
    await fetch("/api/monthly-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "override", key, bucket: bucket === auto ? null : bucket }),
    });
    load(month);
  }

  async function saveWage() {
    await fetch("/api/monthly-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "settings", settings: { wage, nightRate: night / 100 } }),
    });
  }

  const sim = useMemo(() => {
    if (!d) return null;
    const nr = night / 100;
    const allPartCost = d.shift.dayHours * wage + d.shift.nightHours * wage * (1 + nr);
    const affordable = d.regular.beforeLabor > 0 ? Math.floor(d.regular.beforeLabor / wage) : 0;
    const roomAfterNow = d.regular.profit > 0 ? Math.floor(d.regular.profit / wage) : 0;
    const addCost = hours * wage;
    const keep = 1 - d.regular.cogsRate / 100; // 売上1円あたり手元に残る割合
    const needSales = keep > 0 ? addCost / keep : 0;
    const perDay = d.bizDays ? needSales / d.bizDays : 0;
    return { allPartCost, affordable, roomAfterNow, addCost, keep, needSales, perDay };
  }, [d, wage, night, hours]);

  const evLines = d?.lines.filter((l) => l.bucket === "event") ?? [];
  const irLines = d?.lines.filter((l) => l.bucket === "irregular") ?? [];
  const maxHour = d ? Math.max(1, ...d.hourly.map((h) => h.avgSales)) : 1;

  const LineRow = ({ l }: { l: Line }) => (
    <li>
      <span className="dt">{l.date.slice(5)}</span>
      <span className="desc">
        {l.description || l.account}
        <small>
          {l.account}
          {l.reason ? `・${l.reason}` : ""}
        </small>
      </span>
      <b className={l.amount >= 0 ? "plus" : "minus"}>{signed(l.amount)}</b>
      {l.source !== "event-adjust" && l.source !== "estimate" ? (
        <select value={l.bucket} onChange={(e) => move(l.key, e.target.value as Bucket, l.auto)}>
          <option value="regular">通常営業</option>
          <option value="event">イベント</option>
          <option value="irregular">臨時</option>
        </select>
      ) : (
        <span className="fixed">{BUCKET_LABEL[l.bucket]}</span>
      )}
    </li>
  );

  return (
    <main>
      <Nav />
      <h1>🗓 月次レポート</h1>
      <p className="lead">
        freeeに入った実際の数字です。毎月くり返す「通常営業の実力」を先に出し、そのあとイベントや一度きりの収入・支出を足して、その月の成績を出します。
      </p>

      <div className="bar">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button onClick={() => load(month)} disabled={busy}>
          {busy ? "読み込み中…" : "更新"}
        </button>
      </div>
      {err && <p className="err">{err}</p>}

      {d && (
        <>
          <section className="hero">
            <div className="big">
              <div className="cap">① 通常営業の実力</div>
              <div className={`num ${d.regular.profit >= 0 ? "good" : "bad"}`}>{fmt(d.regular.profit)}</div>
              <div className="sub">人件費を払う前は {fmt(d.regular.beforeLabor)}</div>
            </div>
            <div className="big">
              <div className="cap">② イベント・臨時</div>
              <div className={`num ${d.event.total + d.irregular.total >= 0 ? "good" : "bad"}`}>
                {signed(d.event.total + d.irregular.total)}
              </div>
              <div className="sub">
                イベント {signed(d.event.total)} ／ 臨時 {signed(d.irregular.total)}
              </div>
            </div>
            <div className="big">
              <div className="cap">③ この月の成績</div>
              <div className={`num ${d.final >= 0 ? "good" : "bad"}`}>{fmt(d.final)}</div>
              <div className="sub">①＋②</div>
            </div>
          </section>

          <p className="summary">
            {Number(d.month.slice(0, 4))}年{Number(d.month.slice(5))}月は、通常営業で <b className={d.regular.profit >= 0 ? "g" : "r"}>{fmt(d.regular.profit)}</b>
            {d.regular.profit >= 0 ? "の黒字" : "の赤字"}。
            イベントで {signed(d.event.total)}、一度きりの収入・支出で {signed(d.irregular.total)} があり、
            最終的に <b className={d.final >= 0 ? "g" : "r"}>{fmt(d.final)}</b>
            {d.final >= 0 ? "の黒字" : "の赤字"}でした。
          </p>

          <section className="card">
            <h2>① 通常営業の実力</h2>
            <table className="pnl">
              <tbody>
                {d.regular.salesBy.map((s) => (
                  <tr key={s.label} className="sub">
                    <th>売上：{s.label}</th>
                    <td>{fmt(s.amount)}</td>
                  </tr>
                ))}
                <tr className="mid">
                  <th>売上</th>
                  <td>{fmt(d.regular.sales)}</td>
                </tr>
                <tr>
                  <th>材料の仕入れ（売上の{d.regular.cogsRate}%）</th>
                  <td className="minus">−{fmt(d.regular.cogs)}</td>
                </tr>
                {d.regular.expenses.map((e) => (
                  <tr key={e.account} className="sub">
                    <th>{e.account}</th>
                    <td className="minus">{e.amount >= 0 ? "−" : "+"}{fmt(Math.abs(e.amount))}</td>
                  </tr>
                ))}
                <tr className="mid">
                  <th>人件費を払う前の利益</th>
                  <td>{fmt(d.regular.beforeLabor)}</td>
                </tr>
                {d.regular.labor.map((l) => (
                  <tr key={l.label} className="sub">
                    <th>
                      {l.label}
                      {l.estimate && <span className="est">見込み</span>}
                    </th>
                    <td className="minus">−{fmt(l.amount)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <th>通常営業の利益</th>
                  <td className={d.regular.profit >= 0 ? "good" : "bad"}>{fmt(d.regular.profit)}</td>
                </tr>
              </tbody>
            </table>
            <p className="note">
              「見込み」は毎月かかるのに、この月のfreeeにまだ載っていないもの（社保は翌月払い、業務委託は後払い）。
              {d.eventLabels.length > 0 && <> イベント日（{d.eventLabels.join("、")}）のレジ売上は②に移しています。</>}
            </p>
          </section>

          <section className="card">
            <h2>② イベント・臨時（毎月はないもの）</h2>
            <h3>
              イベント <span>{signed(d.event.total)}</span>
            </h3>
            {evLines.length ? (
              <ul className="lines">{evLines.map((l) => <LineRow key={l.key} l={l} />)}</ul>
            ) : (
              <p className="note">この月のイベントはありません。</p>
            )}
            <h3>
              臨時の収入・支出 <span>{signed(d.irregular.total)}</span>
            </h3>
            {irLines.length ? (
              <ul className="lines">{irLines.map((l) => <LineRow key={l.key} l={l} />)}</ul>
            ) : (
              <p className="note">一度きりの収入・支出はありません。</p>
            )}
            <p className="note">
              右の選択で「通常営業／イベント／臨時」を付け替えられます。付け替えは保存され、次から自動で反映されます。
              イベントのドリンクの材料費は通常営業の仕入れに混ざっています。
            </p>
          </section>

          <section className="card">
            <h2>③ この月の成績</h2>
            <table className="pnl">
              <tbody>
                <tr>
                  <th>① 通常営業の利益</th>
                  <td>{fmt(d.regular.profit)}</td>
                </tr>
                <tr>
                  <th>イベント</th>
                  <td>{signed(d.event.total)}</td>
                </tr>
                <tr>
                  <th>臨時の収入・支出</th>
                  <td>{signed(d.irregular.total)}</td>
                </tr>
                <tr className="total">
                  <th>この月の成績</th>
                  <td className={d.final >= 0 ? "good" : "bad"}>{fmt(d.final)}</td>
                </tr>
              </tbody>
            </table>
            {d.offBook.length > 0 && (
              <p className="note loan">
                このほか、まだ売上にならない入金があります：
                {d.offBook.map((o) => `${o.date.slice(5)} ${o.label} ${fmt(o.amount)}`).join("、")}。
                クラファンはリターンを送った時点で売上になります。
              </p>
            )}
          </section>

          {sim && (
            <section className="card">
              <h2>④ アルバイトを入れたら</h2>
              <div className="inputs">
                <label>
                  時給
                  <input type="number" value={wage} onChange={(e) => setWage(Number(e.target.value) || 0)} onBlur={saveWage} />
                </label>
                <label>
                  深夜割増（22時〜）%
                  <input type="number" value={night} onChange={(e) => setNight(Number(e.target.value) || 0)} onBlur={saveWage} />
                </label>
                <label>
                  入れたい時間（月）
                  <input type="number" value={hours} onChange={(e) => setHours(Number(e.target.value) || 0)} />
                </label>
              </div>

              <table className="pnl">
                <tbody>
                  <tr>
                    <th>この月のシフト（{d.shift.days}日分）</th>
                    <td>
                      {Math.round((d.shift.dayHours + d.shift.nightHours) * 10) / 10}時間
                      <small>（昼 {d.shift.dayHours}h・深夜 {d.shift.nightHours}h）</small>
                    </td>
                  </tr>
                  <tr>
                    <th>全部アルバイトだったら人件費</th>
                    <td className="minus">−{fmt(sim.allPartCost)}</td>
                  </tr>
                  <tr className="mid">
                    <th>そのときの通常営業の利益</th>
                    <td className={d.regular.beforeLabor - sim.allPartCost >= 0 ? "good" : "bad"}>
                      {fmt(d.regular.beforeLabor - sim.allPartCost)}
                    </td>
                  </tr>
                  <tr>
                    <th>人件費を払う前の利益で払える時間</th>
                    <td>{sim.affordable}時間</td>
                  </tr>
                  <tr>
                    <th>今の人件費を払ったうえで、まだ入れられる時間</th>
                    <td>{sim.roomAfterNow}時間</td>
                  </tr>
                </tbody>
              </table>

              <div className="what-if">
                <p>
                  今の体制に <b>{hours}時間</b> 足すと人件費 <b>{fmt(sim.addCost)}</b>。
                  通常営業の利益は <b className={d.regular.profit - sim.addCost >= 0 ? "g" : "r"}>{fmt(d.regular.profit - sim.addCost)}</b> になります。
                </p>
                <p>
                  元を取るには売上が <b>月 +{fmt(sim.needSales)}</b>（営業日あたり +{fmt(sim.perDay)}）必要です。
                  売上1円のうち材料費を引いて残るのは {Math.round(sim.keep * 100)}%。
                </p>
              </div>

              <h3>時間帯ごとの平均売上（通常営業の日・{d.bizDays}日の平均）</h3>
              <ul className="hours">
                {d.hourly.map((h) => {
                  const covers = h.avgSales * sim.keep >= wage;
                  return (
                    <li key={h.hour} className={covers ? "ok" : ""}>
                      <span className="hh">{h.hour}時</span>
                      <span className="track">
                        <i style={{ width: `${(h.avgSales / maxHour) * 100}%` }} />
                      </span>
                      <span className="v">{fmt(h.avgSales)}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="note">
                緑の時間帯は、その1時間の売上から材料費を引いた額が時給を上回っています。
                ただし家賃などの経費はまだ引いていないので、緑でも店全体で黒字とは限りません。
                交通費・労災保険・雇用保険は含めていません。
              </p>
            </section>
          )}

          <section className="card">
            <button className="ghost" onClick={() => setShowAll(!showAll)}>
              {showAll ? "明細を閉じる" : `明細をすべて見る（${d.lines.length}行）`}
            </button>
            {showAll && <ul className="lines all">{d.lines.map((l) => <LineRow key={l.key} l={l} />)}</ul>}
          </section>
        </>
      )}

      <style jsx>{`
        main { max-width: 860px; margin: 0 auto; padding: 16px 14px 60px; }
        h1 { font-size: 20px; margin: 12px 0 4px; }
        .lead { color: #666; font-size: 13px; margin: 0 0 14px; line-height: 1.7; }
        .bar { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
        input, select { padding: 7px 9px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; background: #fff; }
        button { padding: 8px 14px; border: 0; border-radius: 8px; background: #2b6cb0; color: #fff; font-size: 14px; }
        button.ghost { background: #eee; color: #333; }
        .err { color: #c53030; font-size: 13px; }
        .hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
        .big { background: #fff; border: 1px solid #eee; border-radius: 12px; padding: 14px; }
        .cap { font-size: 12px; color: #777; }
        .num { font-size: 26px; font-weight: 700; margin: 4px 0; letter-spacing: -0.5px; }
        .num.good, .good { color: #1a7f37; }
        .num.bad, .bad { color: #c53030; }
        .sub { font-size: 12px; color: #777; }
        .summary { background: #f6f2ea; border-radius: 10px; padding: 12px 14px; font-size: 14px; line-height: 1.8; margin: 14px 0 0; color: #3a2f1f; }
        .summary .g { color: #1a7f37; }
        .summary .r { color: #c53030; }
        .card { background: #fff; border: 1px solid #eee; border-radius: 12px; padding: 14px; margin-top: 14px; }
        .card h2 { font-size: 15px; margin: 0 0 10px; }
        .card h3 { font-size: 13px; margin: 14px 0 6px; display: flex; justify-content: space-between; color: #444; }
        table.pnl { width: 100%; border-collapse: collapse; font-size: 14px; }
        table.pnl th { text-align: left; font-weight: 400; color: #555; padding: 6px 0; }
        table.pnl td { text-align: right; padding: 6px 0; font-variant-numeric: tabular-nums; }
        table.pnl td small { color: #888; margin-left: 4px; }
        table.pnl tr.sub th, table.pnl tr.sub td { font-size: 12.5px; color: #777; padding: 3px 0 3px 12px; }
        table.pnl .minus { color: #a05252; }
        table.pnl tr.mid th, table.pnl tr.mid td { border-top: 1px solid #eee; font-weight: 600; }
        table.pnl tr.total th, table.pnl tr.total td { border-top: 2px solid #333; font-weight: 700; font-size: 16px; padding-top: 8px; }
        .est { font-size: 10.5px; background: #fff3cd; color: #8a6d1a; border-radius: 4px; padding: 1px 5px; margin-left: 6px; }
        .note { font-size: 12px; color: #777; margin: 10px 0 0; line-height: 1.7; }
        .note.loan { background: #f6f2ea; border-radius: 8px; padding: 9px 11px; color: #6b5b43; }
        ul { list-style: none; margin: 0; padding: 0; }
        .lines li { display: grid; grid-template-columns: 44px 1fr auto auto; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px dashed #eee; font-size: 13px; }
        .lines .dt { color: #888; font-size: 12px; }
        .lines .desc small { display: block; color: #999; font-size: 11px; }
        .lines b { font-variant-numeric: tabular-nums; }
        .lines .plus { color: #1a7f37; }
        .lines .minus { color: #a05252; }
        .lines select { font-size: 12px; padding: 4px 6px; }
        .lines .fixed { font-size: 11px; color: #999; }
        .lines.all { margin-top: 10px; }
        .inputs { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
        .inputs label { display: grid; gap: 4px; font-size: 12px; color: #555; }
        .inputs input { width: 130px; }
        .what-if { background: #eef5fb; border-radius: 10px; padding: 10px 12px; margin-top: 10px; font-size: 13.5px; line-height: 1.8; }
        .what-if p { margin: 0; }
        .what-if .g { color: #1a7f37; }
        .what-if .r { color: #c53030; }
        .hours li { display: grid; grid-template-columns: 40px 1fr 80px; gap: 8px; align-items: center; padding: 3px 0; font-size: 12px; }
        .hours .hh { color: #666; }
        .hours .track { background: #f2f2f2; border-radius: 4px; height: 12px; overflow: hidden; }
        .hours .track i { display: block; height: 100%; background: #cbd5e0; }
        .hours li.ok .track i { background: #48bb78; }
        .hours .v { text-align: right; font-variant-numeric: tabular-nums; }
        @media (max-width: 520px) {
          .lines li { grid-template-columns: 40px 1fr; }
          .lines b, .lines select, .lines .fixed { grid-column: 2; justify-self: start; }
        }
      `}</style>
    </main>
  );
}
