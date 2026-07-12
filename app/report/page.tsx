"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";

type Item = { date: string; name: string; amount: number; source: string };
type TagAgg = { tag: string; total: number; count: number; items: Item[] };

export default function Report() {
  const [tags, setTags] = useState<TagAgg[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/report")
      .then((r) => r.json())
      .then((j) => setTags(j.tags ?? []))
      .catch(() => setTags([]));
  }, []);

  const grand = tags?.reduce((s, t) => s + t.total, 0) ?? 0;

  return (
    <div className="wrap">
      <header>
        <h1>📊 用途別レポート</h1>
        <p>用途タグごとに「何にいくら使ったか」を集計（勘定科目とは別の目的別内訳）</p>
      </header>
      <Nav />

      {tags === null && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          <span className="spinner" style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }} />
          読み込み中…
        </div>
      )}

      {tags && tags.length === 0 && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          まだ用途タグの付いた支出がありません。<br />
          領収書・明細を登録するとき「用途タグ」を付けると、ここに目的別で集計されます。
        </div>
      )}

      {tags && tags.length > 0 && (
        <div className="connected-note">用途タグ {tags.length} 種 ／ 合計 ¥{grand.toLocaleString()}</div>
      )}

      {tags?.map((t) => (
        <div key={t.tag} className="card">
          <div
            className="report-head"
            onClick={() => setOpen((s) => ({ ...s, [t.tag]: !s[t.tag] }))}
          >
            <div>
              <span className="report-tag">{t.tag}</span>
              <span className="report-count">{t.count}件</span>
            </div>
            <div className="report-total">¥{t.total.toLocaleString()}</div>
          </div>
          {open[t.tag] && (
            <div className="report-items">
              {t.items.map((i, idx) => (
                <div key={idx} className="report-item">
                  <span>
                    {i.date}・{i.name}
                    <span className="report-src">{i.source}</span>
                  </span>
                  <span>¥{i.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
