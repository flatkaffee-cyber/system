"use client";

import AppChrome from "@/components/AppChrome";

// 経理のページの外枠。2026-10-26 から店舗側と同じ外枠（AppChrome）を使う。
// PC は左にサイドバー（経理は「経理」の分野にまとまっている）、スマホは上の帯の ☰ でメニューを開く。
// app/(keiri)/layout.tsx が使う。
export default function KeiriShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppChrome />
      <div className="content">{children}</div>
    </>
  );
}
