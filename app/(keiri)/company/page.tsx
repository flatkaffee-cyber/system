"use client";

import CompanyDocs from "@/components/CompanyDocs";

// 会社書類。定款・登記・印鑑証明など、会社そのものを証明する書類。中身は components/CompanyDocs.tsx
export default function Company() {
  return (
    <CompanyDocs
      title="🏢 会社書類"
      lead="定款・登記・印鑑証明など、会社そのものを証明する書類の置き場です。役所や銀行に出すときにここから探します。"
    />
  );
}
