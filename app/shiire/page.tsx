"use client";

// 仕入れのページ。2026-11-18 坂本さんの指摘で作り直した:
//   開いたら仕入れ表（全品目）をすぐ出す。品目名は短く（牛乳・ツナ缶）、食材と備品に分ける。
//   「そろそろ」とAIの発注相談は外し、「毎月の金額」は分析のページ（数字 → 分析 → 仕入れ）へ移した。
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import InventorySheet from "@/components/InventorySheet";
import VendorList from "@/components/VendorList";
import PurchaseList from "@/components/PurchaseList";

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

export default function Shiire() {
  const [tab, setTab] = useState<"list" | "vendors" | "links">("list");

  // /inventory から来たときは、買う先の登録を開く
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "sheet") setTab("links");
  }, []);

  return (
    <div className="wrap" style={tab === "list" ? { maxWidth: 1180 } : undefined}>
      <header>
        <h1>🛒 仕入れ</h1>
        <p>
          {tab === "links"
            ? "何をどこでいくらで買うか。この画面で足す・直す・消す"
            : "何を、いつ、どこで買っているか"}
        </p>
      </header>
      <Nav />

      <div className="sub-tabs">
        {(
          [
            ["list", "📋 仕入れ表"],
            ["vendors", "🏪 お店ごと"],
            ["links", "🔗 買う先の登録"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={`sub-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "list" && <PurchaseList />}
      {tab === "vendors" && <VendorList />}
      {tab === "links" && <InventorySheet />}

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
    </div>
  );
}
