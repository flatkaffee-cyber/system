"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import Nav from "@/components/Nav";
import InventorySheet from "@/components/InventorySheet";

// 仕入先の発注ページ。1タップで飛べるようにここに置く。
// 「お気に入り」「再購入」のように前に買ったものが並ぶページを優先する。
// （lib/shiire から import するとKV側のコードがクライアントに入るのでここで持つ）
const SHOPS: { name: string; url: string; note: string }[] = [
  {
    name: "容器スタイル",
    url: "https://www.packstyle.jp/wishlist.html",
    note: "お気に入り一覧。バーガー袋ほか包材。¥3,850以上で送料無料",
  },
  {
    name: "アミカ ネットショップ",
    url: "https://www.amicashop.com/",
    note: "ワッフル粉・シロップなど。¥10,000以上で送料無料",
  },
  {
    name: "Amazon 再購入",
    url: "https://www.amazon.co.jp/gp/buyagain",
    note: "過去に買ったものが並ぶ。ジンジャーエールなど",
  },
  {
    name: "Amazon ほしい物リスト",
    url: "https://www.amazon.co.jp/hz/wishlist/ls/8FJVIJUEMZ7L",
    note: "梅シロップなど。定番の仕入れをまとめてある",
  },
  {
    name: "ヨドバシ お気に入り",
    url: "https://order.yodobashi.com/yc/favorite/index.html",
    note: "テキーラ（クエルボ エスペシャル）など",
  },
  {
    name: "カインズ",
    url: "https://www.cainz.com/",
    note: "消耗品・資材",
  },
];

// 仕入れサイクル。領収書の履歴から品目ごとの購入間隔を自動集計し、
// 「そろそろ切れる」ものを教える。手で頻度を登録する必要はない。

type Stat = {
  name: string;
  displayName: string;
  category: string;
  vendor: string;
  count: number;
  dates: string[];
  lastDate: string;
  lastAmount: number;
  totalAmount: number;
  avgIntervalDays: number | null;
  daysSinceLast: number;
  nextDueDate: string | null;
  daysUntilDue: number | null;
  status: "overdue" | "soon" | "ok" | "unknown";
  reliable: boolean;
  spanDays: number;
};

const LABEL: Record<Stat["status"], { text: string; color: string }> = {
  overdue: { text: "買い時すぎ", color: "#c0392b" },
  soon: { text: "もうすぐ", color: "#b5651d" },
  ok: { text: "まだ大丈夫", color: "var(--ok)" },
  unknown: { text: "周期不明", color: "var(--muted)" },
};

// 表の列。key は並べ替えに使う
type SortKey = "name" | "vendor" | "lastAmount" | "lastDate" | "interval" | "due" | "count" | "total";
const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "name", label: "品目" },
  { key: "lastAmount", label: "前回の金額", align: "right" },
  { key: "lastDate", label: "前回買った日", align: "right" },
  { key: "interval", label: "いつも", align: "right" },
  { key: "due", label: "状態", align: "right" },
  { key: "vendor", label: "購入先" },
  { key: "count", label: "回数", align: "right" },
  { key: "total", label: "累計", align: "right" },
];
const sortValue = (s: Stat, k: SortKey): string | number => {
  switch (k) {
    case "name": return s.displayName;
    case "vendor": return s.vendor;
    case "lastAmount": return s.lastAmount;
    case "lastDate": return s.daysSinceLast; // 何日前が小さい＝最近
    case "interval": return s.avgIntervalDays ?? 9999;
    // 超過が大きいものほど上。周期不明は最後
    case "due": return s.daysUntilDue ?? 9999;
    case "count": return s.count;
    case "total": return s.totalAmount;
  }
};

export default function Shiire() {
  const [stats, setStats] = useState<Stat[]>([]);
  const [summary, setSummary] = useState<{ total: number; overdue: number; soon: number; tracked: number } | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"need" | "all" | "sheet">("need");
  const [advice, setAdvice] = useState("");
  const [adviceBusy, setAdviceBusy] = useState(false);
  const [openName, setOpenName] = useState<string | null>(null);
  // 表の並べ替えと検索（エクセルのように見るため）
  const [sortKey, setSortKey] = useState<SortKey>("due");
  const [sortAsc, setSortAsc] = useState(true);
  const [q, setQ] = useState("");

  // /inventory から来たときは仕入れ表のタブを開く
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "sheet") setTab("sheet");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shiire?min=1");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setStats(d.stats || []);
      setSummary(d.summary || null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const askAdvice = async () => {
    setAdviceBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/shiire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soonDays: 3 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "生成に失敗");
      setAdvice(d.advice || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "生成に失敗");
    } finally {
      setAdviceBusy(false);
    }
  };

  // 「そろそろ」は周期が信頼できるものだけ（開業準備のまとめ買いを除く）
  const need = stats.filter((s) => s.reliable && (s.status === "overdue" || s.status === "soon"));
  const base = tab === "need" ? need : stats;
  const query = q.trim().toLowerCase();
  const list = base
    .filter((s) => !query || `${s.displayName} ${s.vendor} ${s.category}`.toLowerCase().includes(query))
    .sort((a, b) => {
      const va = sortValue(a, sortKey), vb = sortValue(b, sortKey);
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "ja");
      return sortAsc ? c : -c;
    });
  const clickSort = (k: SortKey) => {
    if (k === sortKey) setSortAsc(!sortAsc);
    else {
      setSortKey(k);
      // 金額・回数は大きい順、それ以外は小さい順から
      setSortAsc(!["lastAmount", "count", "total"].includes(k));
    }
  };

  return (
    <div className="wrap">
      <header>
        <h1>🛒 仕入れ</h1>
        <p>
          {tab === "sheet"
            ? "何をどこでいくらで買うか。この画面で足す・直す・消す"
            : "領収書の履歴から、品目ごとの購入間隔を自動で集計しています"}
        </p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}

      {summary && tab !== "sheet" && (
        <div className="card total-card">
          <div className="total-label">そろそろ仕入れ</div>
          <div className="total-amount">{summary.overdue + summary.soon}件</div>
          <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 12, opacity: 0.85, flexWrap: "wrap" }}>
            <span>⚠️ 買い時すぎ {summary.overdue}</span>
            <span>⏳ もうすぐ {summary.soon}</span>
            <span>📈 周期がわかる品目 {summary.tracked}/{summary.total}</span>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 14 }}>
        <div className="cat-title">🛍️ 発注ページ</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
          {SHOPS.map((s) => (
            <a
              key={s.name}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              title={s.note}
              style={{
                display: "inline-block",
                padding: "7px 12px",
                borderRadius: 6,
                border: "1px solid var(--line, #ddd)",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {s.name} ↗
            </a>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          「お気に入り」「再購入」のページを登録してあるので、前に買ったものがそのまま並びます。
        </p>
      </div>

      {tab !== "sheet" && (
      <div className="card" style={{ padding: 14 }}>
        <div style={{ textAlign: "center" }}>
          <button className="primary" onClick={askAdvice} disabled={adviceBusy}>
            {adviceBusy ? "AIが確認中..." : "🤖 いま何を発注すべきか聞く"}
          </button>
        </div>
        {advice && (
          <div style={{ marginTop: 12, fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
            {advice}
          </div>
        )}
      </div>
      )}

      <div className="sub-tabs">
        {(
          [
            ["need", `そろそろ (${need.length})`],
            ["all", `全品目 (${stats.length})`],
            ["sheet", "📦 仕入れ表"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={`sub-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "sheet" && <InventorySheet />}

      {tab !== "sheet" && loading && <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>集計中…</div>}

      {tab !== "sheet" && !loading && list.length === 0 && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          {tab === "need" ? "🎉 いま急いで買うものはありません。" : "データがありません。"}
        </div>
      )}

      {tab !== "sheet" && !loading && base.length > 0 && (
        <div className="card" style={{ padding: 10 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="品目・購入先で絞り込む（例：業務スーパー）"
            style={{ width: "100%", boxSizing: "border-box", marginBottom: 8 }}
          />
          <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 6 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%", minWidth: 760 }}>
              <thead>
                <tr>
                  {COLUMNS.map((c, i) => (
                    <th
                      key={c.key}
                      onClick={() => clickSort(c.key)}
                      style={{
                        textAlign: c.align || "left", padding: "7px 8px", cursor: "pointer", whiteSpace: "nowrap",
                        background: "#f3efe8", borderBottom: "2px solid var(--line)", borderRight: "1px solid var(--line)",
                        position: "sticky", top: 0, left: i === 0 ? 0 : undefined, zIndex: i === 0 ? 2 : 1,
                      }}
                    >
                      {c.label}{sortKey === c.key ? (sortAsc ? " ▲" : " ▼") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((s, idx) => {
                  const lb = LABEL[s.status];
                  const open = openName === s.name;
                  const bg = idx % 2 ? "#faf8f4" : "#fff";
                  const td = { padding: "6px 8px", borderBottom: "1px solid var(--line)", borderRight: "1px solid var(--line)", whiteSpace: "nowrap" as const };
                  return (
                    <Fragment key={s.name}>
                      <tr onClick={() => setOpenName(open ? null : s.name)} style={{ background: bg, cursor: "pointer" }}>
                        <td style={{ ...td, position: "sticky", left: 0, background: bg, fontWeight: 700, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {s.displayName}
                        </td>
                        <td style={{ ...td, textAlign: "right" }} className="mono">¥{s.lastAmount.toLocaleString()}</td>
                        <td style={{ ...td, textAlign: "right" }} className="mono">
                          {s.lastDate.slice(5).replace("-", "/")}
                          <span style={{ color: "var(--muted)" }}>（{s.daysSinceLast}日前）</span>
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>{s.avgIntervalDays !== null ? `${s.avgIntervalDays}日ごと` : "—"}</td>
                        <td style={{ ...td, textAlign: "right", color: s.reliable ? lb.color : "var(--muted)", fontWeight: 700 }}>
                          {s.reliable ? lb.text : "参考"}
                          {s.daysUntilDue !== null && (
                            <span style={{ fontWeight: 400, color: "var(--muted)" }}>
                              {" "}{s.daysUntilDue < 0 ? `${-s.daysUntilDue}日超過` : `あと${s.daysUntilDue}日`}
                            </span>
                          )}
                        </td>
                        <td style={td}>{s.vendor}</td>
                        <td style={{ ...td, textAlign: "right" }} className="mono">{s.count}</td>
                        <td style={{ ...td, textAlign: "right" }} className="mono">¥{s.totalAmount.toLocaleString()}</td>
                      </tr>
                      {open && (
                        <tr style={{ background: bg }}>
                          <td colSpan={COLUMNS.length} style={{ ...td, whiteSpace: "normal", fontSize: 12, color: "var(--muted)" }}>
                            科目：{s.category} ／ 買った日：{s.dates.map((d) => d.slice(5).replace("-", "/")).join("・")}
                            {s.nextDueDate && ` ／ 次の目安：${s.nextDueDate.slice(5).replace("-", "/")}`}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hint" style={{ margin: "6px 0 0" }}>
            列の名前を押すと並べ替えできます（もう一度押すと逆順）。行を押すと、買った日の一覧が出ます。{list.length}件
          </p>
        </div>
      )}

      <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>
        ※ 同じ品目を<b>3回以上・2週間以上にわたって</b>買うと、周期として扱い「そろそろ」に出します。
        それ未満は「参考」表示です（開業準備で数日のうちに何度も買った備品を、定期購入と誤認しないため）。
        領収書を登録し続けるほど精度が上がります。
      </p>
    </div>
  );
}
