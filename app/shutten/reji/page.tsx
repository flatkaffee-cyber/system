"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Nav from "@/components/Nav";

// 出店イベントのレジ。ボタンで商品を足して、預かり金からお釣りを出す。
// 会計はイベントごとにKVへ記録し、下に商品別の個数と売上を出す。

type Ev = { id: string; title: string; date: string };
type Line = { name: string; price: number; qty: number };
type Sale = {
  id: string; at: string; lines: Line[]; total: number;
  pay: "cash" | "card"; received?: number; voided?: boolean;
};

// 2026-10-12 坂本さん指定のメニュー
const MENU: { group: string; items: { name: string; price: number }[] }[] = [
  {
    group: "ホットサンド",
    items: [
      { name: "ホットサンド ハーフセット", price: 600 },
      { name: "ホットサンド フルセット", price: 900 },
    ],
  },
  {
    group: "ワッフル",
    items: [
      { name: "ワッフル 抹茶", price: 500 },
      { name: "ワッフル チョコ", price: 500 },
      { name: "ワッフル プレーン", price: 500 },
    ],
  },
  {
    group: "ドリンク",
    items: [
      { name: "オレンジ", price: 500 },
      { name: "パイナップル", price: 500 },
      { name: "アイスコーヒー", price: 500 },
      { name: "ホットコーヒー", price: 500 },
      { name: "ジンジャーエール", price: 500 },
      { name: "コーラ", price: 500 },
    ],
  },
];

const yen = (n: number) => `¥${n.toLocaleString()}`;
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });

export default function ShuttenReji() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [id, setId] = useState("");
  const [sales, setSales] = useState<Sale[]>([]);
  const [cart, setCart] = useState<Line[]>([]);
  const [pay, setPay] = useState<"cash" | "card">("cash");
  const [received, setReceived] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [last, setLast] = useState<{ total: number; change: number | null } | null>(null);
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async (target?: string) => {
    try {
      const res = await fetch(`/api/shutten/reji${target ? `?id=${encodeURIComponent(target)}` : ""}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setEvents(d.events || []);
      setId(d.id || "");
      setSales(d.sales || []);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "読み込みに失敗しました");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = (name: string, price: number) => {
    setLast(null);
    setCart((prev) => {
      const i = prev.findIndex((l) => l.name === name);
      if (i < 0) return [...prev, { name, price, qty: 1 }];
      return prev.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
    });
  };
  const dec = (name: string) =>
    setCart((prev) => prev.flatMap((l) => (l.name !== name ? [l] : l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : [])));

  const total = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const change = received !== null ? received - total : null;
  const canPay = cart.length > 0 && !busy && (pay === "card" || (received !== null && received >= total));

  const checkout = async () => {
    if (!canPay) return;
    setBusy(true);
    try {
      const res = await fetch("/api/shutten/reji", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sale", id, lines: cart, pay, received: pay === "cash" ? received : undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "保存に失敗しました");
      setLast({ total, change: pay === "cash" ? change : null });
      setCart([]); setReceived(null); setPay("cash");
      setSales((prev) => [...prev, d.sale]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const toggleVoid = async (s: Sale) => {
    if (!confirm(s.voided ? "取り消しを戻しますか？" : `${time(s.at)} の ${yen(s.total)} を取り消しますか？`)) return;
    try {
      const res = await fetch("/api/shutten/reji", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "void", id, saleId: s.id, voided: !s.voided }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "失敗しました");
      setSales((prev) => prev.map((x) => (x.id === s.id ? { ...x, voided: !s.voided } : x)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "失敗しました");
    }
  };

  const summary = useMemo(() => {
    const ok = sales.filter((s) => !s.voided);
    const byItem = new Map<string, { qty: number; amount: number }>();
    for (const s of ok) for (const l of s.lines) {
      const cur = byItem.get(l.name) ?? { qty: 0, amount: 0 };
      byItem.set(l.name, { qty: cur.qty + l.qty, amount: cur.amount + l.price * l.qty });
    }
    return {
      count: ok.length,
      total: ok.reduce((a, s) => a + s.total, 0),
      cash: ok.filter((s) => s.pay === "cash").reduce((a, s) => a + s.total, 0),
      card: ok.filter((s) => s.pay === "card").reduce((a, s) => a + s.total, 0),
      byItem: MENU.flatMap((g) => g.items).map((m) => ({ name: m.name, ...(byItem.get(m.name) ?? { qty: 0, amount: 0 }) })),
    };
  }, [sales]);

  const quick = [total, 1000, 2000, 5000, 10000].filter((v, i, a) => v >= total && v > 0 && a.indexOf(v) === i);

  return (
    <div className="wrap">
      <Nav />
      <header>
        <h1>🧮 出店レジ</h1>
        <p>出店イベントの会計。商品を押して、預かり金を選んで会計</p>
      </header>

      <div className="card" style={{ padding: "10px 14px" }}>
        <select value={id} onChange={(e) => load(e.target.value)}>
          {events.map((e) => (
            <option key={e.id} value={e.id}>{e.date} {e.title}</option>
          ))}
        </select>
      </div>

      {err && <p className="err">{err}</p>}

      {MENU.map((g) => (
        <div key={g.group} className="card menu-card">
          <h2>{g.group}</h2>
          <div className="btns">
            {g.items.map((m) => {
              const inCart = cart.find((l) => l.name === m.name)?.qty ?? 0;
              return (
                <button key={m.name} className={`item-btn ${inCart ? "on" : ""}`} onClick={() => add(m.name, m.price)}>
                  <span className="item-name">{m.name.replace(/^(ホットサンド|ワッフル) /, "")}</span>
                  <span className="item-price">{yen(m.price)}</span>
                  {inCart > 0 && <span className="badge-qty">{inCart}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="card pay-card">
        {last && cart.length === 0 && (
          <div className="last">
            会計しました　{yen(last.total)}
            {last.change !== null && <strong>　お釣り {yen(last.change)}</strong>}
          </div>
        )}

        {cart.length === 0 ? (
          <p className="empty">商品を押してください</p>
        ) : (
          <>
            {cart.map((l) => (
              <div key={l.name} className="line">
                <span className="line-name">{l.name}</span>
                <span className="line-qty">
                  <button className="mini" onClick={() => dec(l.name)}>−</button>
                  {l.qty}
                  <button className="mini" onClick={() => add(l.name, l.price)}>＋</button>
                </span>
                <span className="line-amt">{yen(l.price * l.qty)}</span>
              </div>
            ))}
            <div className="total">合計 <strong>{yen(total)}</strong></div>

            <div className="pay-toggle">
              <button className={pay === "cash" ? "on" : ""} onClick={() => setPay("cash")}>現金</button>
              <button className={pay === "card" ? "on" : ""} onClick={() => { setPay("card"); setReceived(null); }}>キャッシュレス</button>
            </div>

            {pay === "cash" && (
              <>
                <div className="quick">
                  {quick.map((v) => (
                    <button key={v} className={received === v ? "on" : ""} onClick={() => setReceived(v)}>
                      {v === total ? "ちょうど" : yen(v)}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="預かり金を入力"
                  value={received ?? ""}
                  onChange={(e) => setReceived(e.target.value === "" ? null : Number(e.target.value))}
                />
                {change !== null && (
                  <div className={`change ${change < 0 ? "short" : ""}`}>
                    {change < 0 ? `${yen(-change)} 足りません` : <>お釣り <strong>{yen(change)}</strong></>}
                  </div>
                )}
              </>
            )}

            <div className="pay-actions">
              <button className="primary big" disabled={!canPay} onClick={checkout}>
                {busy && <span className="spinner" />}会計する
              </button>
              <button className="small" onClick={() => { setCart([]); setReceived(null); }}>クリア</button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>今日の売上</h2>
        <div className="sum-top">
          <div><span>売上</span><strong>{yen(summary.total)}</strong></div>
          <div><span>会計数</span><strong>{summary.count}件</strong></div>
          <div><span>現金</span><strong>{yen(summary.cash)}</strong></div>
          <div><span>キャッシュレス</span><strong>{yen(summary.card)}</strong></div>
        </div>
        <table className="sum-table">
          <tbody>
            {summary.byItem.map((r) => (
              <tr key={r.name} className={r.qty ? "" : "zero"}>
                <td>{r.name}</td>
                <td className="num">{r.qty}個</td>
                <td className="num">{yen(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="small" style={{ marginTop: 12 }} onClick={() => setShowLog(!showLog)}>
          {showLog ? "会計の履歴を閉じる" : "会計の履歴を見る・取り消す"}
        </button>
        {showLog && (
          <div className="log">
            {[...sales].reverse().map((s) => (
              <div key={s.id} className={`log-row ${s.voided ? "voided" : ""}`}>
                <span className="log-time">{time(s.at)}</span>
                <span className="log-items">{s.lines.map((l) => `${l.name}×${l.qty}`).join("、")}</span>
                <span className="log-amt">{yen(s.total)} {s.pay === "card" ? "💳" : "💴"}</span>
                <button className="mini" onClick={() => toggleVoid(s)}>{s.voided ? "戻す" : "取消"}</button>
              </div>
            ))}
            {sales.length === 0 && <p className="empty">まだ会計がありません</p>}
          </div>
        )}
      </div>

      <style jsx>{`
        h2 { font-size: 15px; margin: 0 0 8px; }
        .menu-card { padding: 12px 14px; }
        .btns { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
        .item-btn {
          position: relative; display: flex; flex-direction: column; align-items: flex-start;
          gap: 2px; padding: 14px 12px; min-height: 64px; border: 1px solid var(--line);
          border-radius: 10px; background: #fff; cursor: pointer; text-align: left;
        }
        .item-btn:active { transform: scale(0.97); }
        .item-btn.on { border-color: var(--accent); background: var(--accent-weak); }
        .item-name { font-size: 16px; font-weight: 700; color: var(--ink); }
        .item-price { font-size: 13px; color: var(--muted); }
        .badge-qty {
          position: absolute; top: 6px; right: 8px; min-width: 24px; height: 24px; border-radius: 12px;
          background: var(--accent); color: #fff; font-size: 13px; font-weight: 700;
          display: flex; align-items: center; justify-content: center; padding: 0 6px;
        }
        .pay-card { position: sticky; bottom: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
        .empty { color: var(--muted); text-align: center; margin: 4px 0; font-size: 14px; }
        .last { background: #e8f5e9; color: var(--ok); padding: 10px 12px; border-radius: 8px; margin-bottom: 8px; font-size: 15px; }
        .line { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 15px; }
        .line-name { flex: 1; }
        .line-qty { display: flex; align-items: center; gap: 8px; }
        .line-amt { width: 72px; text-align: right; }
        .mini { padding: 2px 10px; font-size: 15px; }
        .total { text-align: right; font-size: 16px; margin: 10px 0; }
        .total strong { font-size: 26px; margin-left: 6px; }
        .pay-toggle, .quick { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
        .pay-toggle button, .quick button { flex: 1; padding: 10px 8px; font-size: 15px; min-width: 70px; }
        .pay-toggle button.on, .quick button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
        .change { text-align: right; font-size: 16px; margin: 8px 0; }
        .change strong { font-size: 26px; color: var(--ok); margin-left: 6px; }
        .change.short { color: #c62828; }
        .pay-actions { display: flex; gap: 8px; margin-top: 10px; }
        .big { flex: 1; padding: 14px; font-size: 17px; }
        .small { padding: 6px 12px; font-size: 13px; }
        .sum-top { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 10px; }
        .sum-top div { background: var(--bg); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; }
        .sum-top span { font-size: 12px; color: var(--muted); }
        .sum-top strong { font-size: 18px; }
        .sum-table { width: 100%; border-collapse: collapse; font-size: 14px; }
        .sum-table td { padding: 5px 0; border-bottom: 1px solid var(--line); }
        .sum-table .num { text-align: right; width: 80px; }
        .sum-table .zero { color: var(--muted); }
        .log { margin-top: 10px; }
        .log-row { display: flex; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
        .log-time { color: var(--muted); width: 42px; }
        .log-items { flex: 1; }
        .log-amt { white-space: nowrap; }
        .voided { opacity: 0.45; text-decoration: line-through; }
      `}</style>
    </div>
  );
}
