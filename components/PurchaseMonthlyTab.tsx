"use client";

// 分析の「仕入れ」タブ。仕入れ表の品目ごとに、毎月いくら出ていっているか（2026-11-18 仕入れのページから移した）
import { useEffect, useState } from "react";
import PurchaseMonthly, { type MonthlyStat } from "@/components/PurchaseMonthly";

type Row = { name: string; kind: string; vendor: string; count: number; totalAmount: number; months: Record<string, number> };

export default function PurchaseMonthlyTab() {
  const [stats, setStats] = useState<MonthlyStat[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch("/api/shiire?view=sheet")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "読めませんでした");
        setStats(
          (d.rows as Row[]).map((r) => ({
            name: `${r.kind}:${r.name}`,
            displayName: r.name,
            category: r.kind,
            vendor: r.vendor,
            count: r.count,
            totalAmount: r.totalAmount,
            months: r.months,
          })),
        );
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "読めませんでした"));
  }, []);
  if (err) return <p className="err">{err}</p>;
  if (!stats) return <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>集計中…</div>;
  return <PurchaseMonthly stats={stats} />;
}
