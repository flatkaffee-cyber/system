"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";

type M = {
  member: string;
  hours: number;
  days: number;
  earned: number;
  used: number;
  remaining: number;
};
type Item = {
  id: string;
  date: string;
  vendor: string;
  total: number;
  category: string;
  memo: string;
  member: string;
};
type Data = { connected: boolean; rate?: number; members?: M[]; items?: Item[]; error?: string };

export default function Labor() {
  const [data, setData] = useState<Data | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixMsg, setFixMsg] = useState<string | null>(null);

  function load() {
    fetch("/api/labor-allowance")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ connected: false }));
  }
  useEffect(load, []);

  async function recompute() {
    setFixing(true);
    setFixMsg(null);
    try {
      const res = await fetch("/api/fix-timesheet", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "再計算に失敗");
      setFixMsg(`✓ 勤怠シートの労働時間を再計算しました（${j.filled}行）`);
      load();
    } catch (e) {
      setFixMsg(e instanceof Error ? e.message : "再計算に失敗しました");
    } finally {
      setFixing(false);
    }
  }

  return (
    <div className="wrap">
      <header>
        <h1>🕒 労働枠（経費枠）</h1>
        <p>労働時間 × 時給{data?.rate ? `¥${data.rate}` : "¥1,080"} ＝ 各自が経費に使える枠</p>
      </header>
      <Nav />

      {!data && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          <span className="spinner" style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }} />
          読み込み中…
        </div>
      )}

      {data && !data.connected && (
        <div className="card connect-card">
          <div>
            <strong>Google未接続</strong>
            <p className="hint" style={{ margin: "4px 0 10px" }}>
              勤怠シートを読むにはGoogle連携が必要です。
            </p>
          </div>
          <a className="connect-btn" href="/api/google/authorize">Googleと接続</a>
        </div>
      )}

      {data?.error && <p className="err">{data.error}</p>}

      {data?.connected && (
        <div className="card">
          <button className="primary" onClick={recompute} disabled={fixing}>
            {fixing ? <span className="spinner" /> : "🔧 勤怠の労働時間を再計算（退勤押し忘れの空欄を埋める）"}
          </button>
          {fixMsg && <p className="hint" style={{ marginTop: 8 }}>{fixMsg}</p>}
        </div>
      )}

      {data?.members?.map((m) => {
        const pct = m.earned > 0 ? Math.min(100, Math.round((m.used / m.earned) * 100)) : 0;
        return (
          <div key={m.member} className="card labor-card">
            <div className="labor-head">
              <strong>{m.member}</strong>
              <span className="labor-hours">{m.hours}h／{m.days}日</span>
            </div>
            <div className="labor-bar">
              <div className="labor-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="labor-nums">
              <span>稼いだ枠 ¥{m.earned.toLocaleString()}</span>
              <span>使った ¥{m.used.toLocaleString()}</span>
              <span className={m.remaining < 0 ? "labor-over" : "labor-remain"}>
                残り ¥{m.remaining.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}

      {data?.items && data.items.length > 0 && (
        <div className="card">
          <strong>労働枠で使った経費</strong>
          {data.items.map((i) => (
            <div key={i.id} className="labor-item">
              <span>{i.date}・{i.member}・{i.vendor || i.category}</span>
              <span>¥{i.total.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      <p className="hint" style={{ marginTop: 12 }}>
        ※ 名前対応：坂本達郎→坂本、杏(Anne)→國仲は確定。<strong>Sho・kankichi→櫻井・町田は仮</strong>（違えば直します）。労働時間は勤怠シートの出勤・退勤・休憩から計算。退勤未入力の行は集計対象外。
      </p>
    </div>
  );
}
