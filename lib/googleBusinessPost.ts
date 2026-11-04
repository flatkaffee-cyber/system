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
  callToAction?: { actionType: "LEARN_MORE"; url: string };
};

export function cleanSummary(text: unknown): string {
  return String(text ?? "").trim().slice(0, SUMMARY_MAX);
}

export function buildLocalPost(summary: string, imageUrl?: string, linkUrl?: string): LocalPost {
  const text = cleanSummary(summary);
  if (!text) throw new Error("Googleに出す文章を入れてください");
  return {
    languageCode: "ja",
    topicType: "STANDARD",
    summary: text,
    ...(imageUrl ? { media: [{ mediaFormat: "PHOTO" as const, sourceUrl: imageUrl }] } : {}),
    ...(linkUrl ? { callToAction: { actionType: "LEARN_MORE" as const, url: linkUrl } } : {}),
  };
}

/** 複数の店舗が返ってきたときは、名前に flat が入るものを選ぶ。無ければ先頭 */
export function pickLocation<T extends { title?: string }>(list: T[]): T | null {
  return list.find((l) => /flat/i.test(l.title || "")) ?? list[0] ?? null;
}

export type FeedMedia = {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
};

/** Googleに流さない古さ。止まっていた間の分を一度に流さないように */
export const FEED_MAX_AGE_MS = 24 * 3600 * 1000;

/** つないだあとの投稿で、24時間以内のものを古い順に返す */
export function newFeedPosts(media: FeedMedia[], connectedAt: string, now = Date.now()): FeedMedia[] {
  const since = Date.parse(connectedAt);
  return media
    .filter((m) => {
      const t = Date.parse(m.timestamp || "");
      return t > since && now - t <= FEED_MAX_AGE_MS;
    })
    .sort((a, b) => Date.parse(a.timestamp!) - Date.parse(b.timestamp!));
}

/** インスタのキャプションからハッシュタグを除く。Googleの投稿では意味がないので */
export function captionToSummary(caption?: string): string {
  const text = (caption || "")
    .replace(/[#＃][^\s#＃]+/g, "")
    .replace(/[ \t　]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleanSummary(text || "Instagramを更新しました。");
}

/** 動画はサムネイルを使う。カルーセルは1枚目が media_url に入っている */
export function feedImage(m: FeedMedia): string | undefined {
  return m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url;
}
