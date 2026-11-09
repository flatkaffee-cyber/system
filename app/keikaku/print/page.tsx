"use client";

// 売上計画の印刷ページ。ブラウザの「印刷」から「PDFに保存」を選ぶと、その月の売上計画がPDFになる。
// メニューなどは出さず、A4縦1〜2枚に収まるように詰めて出す。
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import SalesPlan, { useSeiseki } from "@/components/SalesPlan";

function PrintInner() {
  const sp = useSearchParams();
  const month = sp.get("month") || new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);
  const { data, err } = useSeiseki(month);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (data) setReady(true);
  }, [data]);
  return (
    <div className="kp-wrap">
      <style>{`
        body { background: #fff; }
        .kp-wrap { max-width: 820px; margin: 0 auto; padding: 24px 20px 60px; color: #000; background: #fff; }
        .kp-bar { display: flex; gap: 10px; align-items: center; margin-bottom: 18px; flex-wrap: wrap; }
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          .kp-bar { display: none; }
          .kp-wrap { padding: 0; max-width: none; }
          tr { break-inside: avoid; }
        }
      `}</style>
      <div className="kp-bar">
        <button
          onClick={() => window.print()}
          disabled={!ready}
          style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#9a4f17", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
        >
          印刷する・PDFに保存
        </button>
        <span style={{ fontSize: 13, color: "#5f5950" }}>印刷の画面で、送り先を「PDFに保存」にしてください。</span>
      </div>
      {err && <p style={{ color: "#b23a2c" }}>{err}</p>}
      {!data && !err && <p style={{ color: "#5f5950" }}>読み込み中…</p>}
      {data && (
        <>
          <div style={{ fontSize: 12, color: "#5f5950", marginBottom: 4 }}>合同会社flat.</div>
          <SalesPlan data={data} print />
        </>
      )}
    </div>
  );
}

export default function KeikakuPrint() {
  return (
    <Suspense fallback={null}>
      <PrintInner />
    </Suspense>
  );
}
