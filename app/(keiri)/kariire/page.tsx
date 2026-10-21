"use client";

import { useState, useEffect, useCallback } from "react";

type LineItem = { name: string; amount: number; category: string; tags: string[] };
type Advance = {
  id: string;
  date: string;
  vendor: string;
  total: number;
  payer: string;
  category: string;
  memo: string;
  registered: boolean;
  registeredAt?: string;
  lines: LineItem[];
};
type PayerSummary = { total: number; unpaid: number; count: number; unpaidCount: number };
type TagSummary = { tag: string; amount: number };
type Payment = { date: string; amount: number; remaining: number };
type Person = { person: string; advanced: number; repaid: number; balance: number; plan: Payment[] };
type Rule = { monthly: number; day: number; prepayThreshold: number };
type Summary = {
  totalAmount: number;
  totalCount: number;
  byPayer: Record<string, PayerSummary>;
  byTag: TagSummary[];
};

export default function KariirePage() {
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterPayer, setFilterPayer] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [persons, setPersons] = useState<Person[] | null>(null);
  const [rule, setRule] = useState<Rule | null>(null);
  const [openPlan, setOpenPlan] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kariire");
      const data = await res.json();
      setAdvances(data.advances || []);
      setSummary(data.summary || null);
      setPersons(data.persons ?? null);
      setRule(data.rule ?? null);
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const payers = summary ? Object.keys(summary.byPayer).sort() : [];

  const filtered = advances.filter((a) => {
    if (filterPayer !== "all" && a.payer !== filterPayer) return false;
    if (filterStatus === "unpaid" && a.registered) return false;
    if (filterStatus === "paid" && !a.registered) return false;
    return true;
  });

  const filteredTotal = filtered.reduce((s, a) => s + a.total, 0);

  const fmt = (n: number) => `¥${n.toLocaleString()}`;
  const ymd = (d: string) => d.replace(/-/g, "/");

  return (
    <div className="wrap">
      <header>
        <h1>💴 役員借入金（立替）</h1>
        <p>誰にいくら返すか、いつ返し終わるか</p>
      </header>

      {loading ? (
        <p style={{ textAlign: "center", color: "var(--muted)" }}>読み込み中...</p>
      ) : !summary ? (
        <p>データなし</p>
      ) : (
        <>
          {/* 人ごとの残りと返済予定（freee の役員借入金から） */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>立替の残りと返済予定</div>
            {rule && (
              <div style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 12px" }}>
                毎月{rule.day}日に{fmt(rule.monthly)}ずつ返す。役員報酬と業務委託費を払ったあとも口座に
                {fmt(rule.prepayThreshold)}以上残る月は、前倒しで多めに返す（額はその都度決める）
              </div>
            )}
            {!persons ? (
              <p style={{ fontSize: 13, color: "var(--muted)" }}>freee の数字が読めませんでした</p>
            ) : (
              persons.map((p) => {
                const last = p.plan[p.plan.length - 1];
                const open = openPlan === p.person;
                return (
                  <div key={p.person} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700 }}>{p.person}</span>
                      <span style={{ fontSize: 20, fontWeight: 700, color: p.balance < 0 ? "#b22" : undefined }}>
                        {p.balance < 0 ? `返しすぎ ${fmt(-p.balance)}` : `残り ${fmt(p.balance)}`}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                      立て替えた額 {fmt(p.advanced)}　返した額 {fmt(p.repaid)}
                    </div>
                    {p.plan.length > 0 && (
                      <div style={{ fontSize: 13, marginTop: 4 }}>
                        次回 {ymd(p.plan[0].date)} {fmt(p.plan[0].amount)}　／　
                        {p.plan.length}回で {ymd(last.date)} に終わる予定
                        <button
                          type="button"
                          className="sub-tab"
                          style={{ marginLeft: 8, fontSize: 12 }}
                          onClick={() => setOpenPlan(open ? null : p.person)}
                        >
                          {open ? "閉じる" : "予定を見る"}
                        </button>
                      </div>
                    )}
                    {open && (
                      <table style={{ width: "100%", fontSize: 12, marginTop: 8, borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ color: "var(--muted)", textAlign: "right" }}>
                            <th style={{ textAlign: "left", fontWeight: 400 }}>回</th>
                            <th style={{ textAlign: "left", fontWeight: 400 }}>日付</th>
                            <th style={{ fontWeight: 400 }}>返す額</th>
                            <th style={{ fontWeight: 400 }}>残り</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.plan.map((x, i) => (
                            <tr key={x.date} style={{ textAlign: "right", borderTop: "1px solid var(--line)" }}>
                              <td style={{ textAlign: "left", padding: "3px 0" }}>{i + 1}</td>
                              <td style={{ textAlign: "left" }}>{ymd(x.date)}</td>
                              <td>{fmt(x.amount)}</td>
                              <td>{fmt(x.remaining)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* レシートの立替者ごと（絞り込み） */}
          <div style={{ fontSize: 13, fontWeight: 700, margin: "4px 0 8px" }}>保存した立替レシート</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {payers.map((p) => {
              const s = summary.byPayer[p];
              return (
                <button
                  key={p}
                  type="button"
                  className="card"
                  style={{
                    flex: "1 1 120px", textAlign: "center", padding: 10, cursor: "pointer",
                    border: filterPayer === p ? "2px solid var(--accent)" : undefined,
                  }}
                  onClick={() => setFilterPayer(filterPayer === p ? "all" : p)}
                >
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{p}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{fmt(s.total)}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{s.count}件</div>
                  {s.unpaid > 0 && (
                    <div style={{ fontSize: 11, color: "#b22", marginTop: 2 }}>
                      freee 未登録 {fmt(s.unpaid)}（{s.unpaidCount}件）
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* 品目タグ集計 */}
          {summary.byTag.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>何に使った？</div>
              {summary.byTag.slice(0, 10).map((t) => (
                <div key={t.tag} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
                  <span>{t.tag}</span>
                  <span style={{ fontWeight: 700 }}>{fmt(t.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* フィルタ */}
          <div className="sub-tabs" style={{ marginBottom: 12 }}>
            {[
              { key: "all", label: "全件" },
              { key: "unpaid", label: "freee 未登録" },
              { key: "paid", label: "freee 登録済み" },
            ].map((f) => (
              <button
                key={f.key}
                className={`sub-tab ${filterStatus === f.key ? "active" : ""}`}
                onClick={() => setFilterStatus(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
            {filterPayer !== "all" && `${filterPayer}の`}
            {filterStatus === "unpaid" ? "freee 未登録の" : filterStatus === "paid" ? "freee 登録済みの" : ""}立替: {filtered.length}件 / {fmt(filteredTotal)}
          </div>

          {/* 明細リスト */}
          {filtered.map((a) => {
            const expanded = expandedId === a.id;
            return (
              <div
                key={a.id}
                className={`card meisai ${a.registered ? "done" : ""}`}
                style={{ padding: 0 }}
              >
                <div
                  className="meisai-head"
                  onClick={() => setExpandedId(expanded ? null : a.id)}
                >
                  <div>
                    <span style={{
                      display: "inline-block", fontSize: 10, fontWeight: 700,
                      color: a.payer === "坂本" ? "#b5651d" : a.payer === "櫻井" ? "#2e7d32" : "#555",
                      background: a.payer === "坂本" ? "#f3e6d8" : a.payer === "櫻井" ? "#e6f4ea" : "#eee",
                      padding: "1px 8px", borderRadius: 999, marginRight: 6,
                    }}>
                      {a.payer}
                    </span>
                    <span className="meisai-desc">{a.vendor}</span>
                    <div className="meisai-sub">{a.date}</div>
                  </div>
                  <div className="meisai-right">
                    <div className="meisai-amt out">{fmt(a.total)}</div>
                    <div className="meisai-status">
                      {a.registered ? "✓ freee登録済" : "未登録"}
                    </div>
                  </div>
                </div>

                {expanded && (
                  <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--line)" }}>
                    {a.lines.map((l, i) => (
                      <div key={i} className="result-row">
                        <div>
                          <div style={{ fontSize: 13 }}>{l.name}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>
                            {l.category}
                            {l.tags?.length > 0 && ` / ${l.tags.join(", ")}`}
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(l.amount)}</div>
                      </div>
                    ))}
                    {a.memo && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                        メモ: {a.memo}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
