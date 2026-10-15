"use client";

import { Suspense } from "react";
import KeiriMonthly from "@/components/keiri/KeiriMonthly";

// useSearchParams を使うので Suspense で包む（Next.js の決まり）
export default function KeiriPage() {
  return (
    <Suspense fallback={<main><p className="hint">読み込み中…</p></main>}>
      <KeiriMonthly />
    </Suspense>
  );
}
