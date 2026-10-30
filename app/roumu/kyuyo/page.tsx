"use client";

import { useState } from "react";
import Nav from "@/components/Nav";
import {
  MEMBERS, RATES, EXCEPTIONS, FIRST_PAY_MONTH,
  premium, monthlyPayment, payroll, dueDate, addMonth,
} from "@/lib/roumu";

// 労務 › 給与。役員報酬の明細と社会保険料。計算は lib/roumu.ts。
// 毎月6日に当月分の報酬を払い、そこから前月分の社会保険料（本人負担）を引く。

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const ymLabel = (ym: string) => `${Number(ym.slice(0, 4))}年${Number(ym.slice(5))}月`;
const mdLabel = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const thisMonthJST = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);
const todayJST = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export default function Kyuyo() {
  const today = todayJST();
  // 6日を過ぎたら次の支給月を最初に出す
  const firstShown = today.slice(8) > "06" ? addMonth(thisMonthJST(), 1) : thisMonthJST();
  const months: string[] = [];
  for (let m = firstShown; m >= FIRST_PAY_MONTH; m = addMonth(m, -1)) months.push(m);
  const [month, setMonth] = useState(firstShown);

  const rows = payroll(month);
  const tot = rows.reduce(
    (s, r) => ({ pay: s.pay + r.pay, ins: s.ins + r.health + r.support + r.pension, net: s.net + r.net }),
    { pay: 0, ins: 0, net: 0 },
  );
  const p = premium(MEMBERS[0]);
  const pay = monthlyPayment();
  const ex = EXCEPTIONS[month];

  // これからの支払い（保険料の納付と報酬の支給）
  const upcoming = [
    ...[-2, -1, 0, 1].map((n) => {
      const ins = addMonth(thisMonthJST(), n);
      return { date: dueDate(ins), what: `社会保険料 ${ymLabel(ins)}分の納付期限`, amount: pay.total };
    }),
    ...[0, 1].map((n) => {
      const m = addMonth(thisMonthJST(), n);
      return { date: `${m}-06`, what: `役員報酬 ${ymLabel(m)}分の振込（3人）`, amount: payroll(m).reduce((s, r) => s + r.net, 0) };
    }),
  ]
    .filter((u) => u.date >= today && u.date >= "2026-11-01")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

  return (
    <main className="ky">
      <h1>💴 給与</h1>
      <p className="ky-lead">
        役員報酬と社会保険料です。毎月6日に当月分の報酬を払い、そこから<b>前月分</b>の社会保険料（本人負担）を引きます。
      </p>
      <Nav />

      <section className="ky-card">
        <div className="ky-head">
          <h2>報酬の明細</h2>
          <select className="ky-sel" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{ymLabel(m)}支給</option>)}
          </select>
        </div>
        {ex && <p className="ky-warn">⚠️ {ex.note}</p>}
        <div className="ky-scroll">
          <table className="ky-tbl">
            <thead>
              <tr>
                <th>名前</th><th>報酬</th><th>健康保険</th><th>支援金</th><th>厚生年金</th><th>源泉税</th><th>振込額</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{yen(r.pay)}</td>
                  <td>{r.health ? `−${yen(r.health)}` : "—"}</td>
                  <td>{r.support ? `−${yen(r.support)}` : "—"}</td>
                  <td>{r.pension ? `−${yen(r.pension)}` : "—"}</td>
                  <td>{r.tax === null ? "要計算" : r.tax ? `−${yen(r.tax)}` : "¥0"}</td>
                  <td className="ky-strong">{yen(r.net)}</td>
                </tr>
              ))}
              <tr className="ky-sum">
                <td>合計</td><td>{yen(tot.pay)}</td><td colSpan={3}>{tot.ins ? `−${yen(tot.ins)}` : "—"}</td><td></td><td>{yen(tot.net)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="ky-note">
          {rows[0].insMonth
            ? `引いた保険料は ${ymLabel(rows[0].insMonth)}分。`
            : ex ? "" : "この月は前月分の保険料がないので引いていません（社会保険は2026年9月から）。"}
          源泉税は、保険料を引いたあとが88,000円未満なので0円です。
        </p>
      </section>

      <section className="ky-card">
        <h2>社会保険（1人あたり・毎月）</h2>
        <p className="ky-sub">
          標準報酬 健康保険 {yen(MEMBERS[0].stdHealth)}／厚生年金 {yen(MEMBERS[0].stdPension)}（厚生年金は一番下の等級）。
          3人とも同じ。40歳未満なので介護保険はなし。
        </p>
        <div className="ky-scroll">
          <table className="ky-tbl">
            <thead>
              <tr><th>保険</th><th>料率</th><th>本人</th><th>会社</th></tr>
            </thead>
            <tbody>
              <tr><td>健康保険</td><td>{(RATES.health * 100).toFixed(2)}%</td><td>{yen(p.health)}</td><td>約{yen(Math.round(MEMBERS[0].stdHealth * RATES.health - p.health))}</td></tr>
              <tr><td>子ども・子育て支援金</td><td>{(RATES.support * 100).toFixed(2)}%</td><td>{yen(p.support)}</td><td>約{yen(Math.round(MEMBERS[0].stdHealth * RATES.support - p.support))}</td></tr>
              <tr><td>厚生年金</td><td>{(RATES.pension * 100).toFixed(1)}%</td><td>{yen(p.pension)}</td><td>約{yen(Math.round(MEMBERS[0].stdPension * RATES.pension - p.pension))}</td></tr>
              <tr><td>子ども・子育て拠出金</td><td>{(RATES.contribution * 100).toFixed(2)}%</td><td>—</td><td>約{yen(Math.round(MEMBERS[0].stdPension * RATES.contribution))}</td></tr>
              <tr className="ky-sum"><td>合計</td><td></td><td>{yen(p.employee)}</td><td>約{yen(Math.round(p.full - p.employee))}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="ky-note">料率は{RATES.label}。料率は半分ずつ（会社と本人）で、本人分は50銭以下を切り捨てます。</p>
      </section>

      <section className="ky-card">
        <h2>会社が払う保険料（3人分・毎月）</h2>
        <div className="ky-big">{yen(pay.total)}</div>
        <p className="ky-sub">うち本人負担 {yen(pay.employee)}（報酬から引く分）／会社負担 {yen(pay.employer)}</p>
        <p className="ky-note">当月分を翌月末までに納めます（土日なら次の平日）。毎月20日ごろ年金事務所から届く「保険料納入告知書」の金額で、銀行の窓口かネットバンキング（ペイジー）で払います。告知書の金額が正で、ここの数字は見込みです。口座振替は年金事務所に申し出ると使えます。</p>
      </section>

      <section className="ky-card">
        <h2>これからの支払い</h2>
        <ul className="ky-list">
          {upcoming.map((u) => (
            <li key={u.date + u.what}>
              <span className="ky-date">{mdLabel(u.date)}</span>
              <span className="ky-what">{u.what}</span>
              <span className="ky-amt">{yen(u.amount)}</span>
            </li>
          ))}
        </ul>
        <p className="ky-note">
          ほかに：12月の報酬で年末調整（扶養控除等申告書を3人から集める）／2027年2/1までに法定調書合計表と給与支払報告書／毎年7/10までに算定基礎届（紙は届かないのでネットで出す）。
          國仲さんの業務委託費（毎月6日 ¥52,056・源泉なし）は給与ではないのでここには入れていません。
        </p>
      </section>

      <style jsx>{`
        .ky { max-width: 820px; margin: 0 auto; padding: 16px 14px 60px; }
        h1 { font-size: 20px; margin: 12px 0 4px; }
        h2 { font-size: 15px; margin: 0; }
        .ky-lead { color: #666; font-size: 13px; margin: 0 0 14px; max-width: 60ch; line-height: 1.7; }
        .ky-card { background: #fff; border: 1px solid #eee; border-radius: 12px; padding: 14px 16px; margin-top: 12px; }
        .ky-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
        .ky-sel { padding: 6px 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; font-family: inherit; }
        .ky-warn { background: #fff7e6; border: 1px solid #f3d19e; color: #8a5a00; border-radius: 8px; padding: 8px 10px; font-size: 12.5px; margin: 10px 0 0; line-height: 1.6; }
        .ky-scroll { overflow-x: auto; margin-top: 10px; }
        .ky-tbl { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
        .ky-tbl th { text-align: right; font-weight: 600; color: #777; font-size: 11.5px; padding: 6px 8px; border-bottom: 1px solid #eee; white-space: nowrap; }
        .ky-tbl td { text-align: right; padding: 8px; border-bottom: 1px solid #f3f3f3; white-space: nowrap; }
        .ky-tbl th:first-child, .ky-tbl td:first-child { text-align: left; }
        .ky-strong { font-weight: 700; }
        .ky-sum td { font-weight: 700; border-bottom: 0; border-top: 1px solid #ddd; }
        .ky-sub { font-size: 12.5px; color: #555; margin: 6px 0 0; line-height: 1.6; }
        .ky-note { font-size: 12px; color: #888; margin: 10px 0 0; line-height: 1.7; }
        .ky-big { font-size: 26px; font-weight: 700; margin-top: 6px; font-variant-numeric: tabular-nums; }
        .ky-list { list-style: none; padding: 0; margin: 8px 0 0; }
        .ky-list li { display: grid; grid-template-columns: 52px 1fr auto; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f3f3f3; font-size: 13px; }
        .ky-date { font-weight: 700; }
        .ky-amt { font-variant-numeric: tabular-nums; }
      `}</style>
    </main>
  );
}
