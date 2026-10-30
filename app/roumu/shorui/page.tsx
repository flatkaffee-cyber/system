"use client";

import Nav from "@/components/Nav";
import CompanyDocs from "@/components/CompanyDocs";

// 労務 › 書類。年金事務所・労基署・ハローワークから届いた通知や出した届出の置き場。
// 置き場は会社書類（/company）と同じで、種類「年金・労働保険」だけを出す。
export default function RoumuShorui() {
  return (
    <CompanyDocs
      title="📁 労務の書類"
      lead="社会保険・労働保険の通知書や、出した届出の控えの置き場です。会社書類の「年金・労働保険」と同じものが出ます。"
      kinds={["年金・労働保険"]}
      placeholder="健康保険・厚生年金保険 適用通知書"
      nav={<Nav />}
    />
  );
}
