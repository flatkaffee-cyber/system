// Googleビジネスプロフィールの投稿の中身を組み立てる部分。
//
// 保存やAPIの呼び出しは lib/googleBusiness.ts。ここは計算だけにして、テストで確かめられるようにする。

/** Googleの投稿の本文の上限。超えるとAPIが受け付けない */
export const SUMMARY_MAX = 1500;

export type LocalPost = {
  languageCode: "ja";
  topicType: "STANDARD";
  summary: string;
  media?: { mediaFormat: "PHOTO"; sourceUrl: string }[];
};

export function cleanSummary(text: unknown): string {
  return String(text ?? "").trim().slice(0, SUMMARY_MAX);
}

export function buildLocalPost(summary: string, imageUrl?: string): LocalPost {
  const text = cleanSummary(summary);
  if (!text) throw new Error("Googleに出す文章を入れてください");
  return {
    languageCode: "ja",
    topicType: "STANDARD",
    summary: text,
    ...(imageUrl ? { media: [{ mediaFormat: "PHOTO" as const, sourceUrl: imageUrl }] } : {}),
  };
}

/** 複数の店舗が返ってきたときは、名前に flat が入るものを選ぶ。無ければ先頭 */
export function pickLocation<T extends { title?: string }>(list: T[]): T | null {
  return list.find((l) => /flat/i.test(l.title || "")) ?? list[0] ?? null;
}
