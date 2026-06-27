import { z } from "zod";

/**
 * flat. 会計マスターの科目（クロスウォーク準拠）。
 * AI はこの中から最も近い科目を1つ選ぶ。
 * - 原価5区分 → freee「仕入高」＋品目
 * - 経費 → freee標準勘定科目に1:1
 * - 設備 → 固定資産（エスプレッソマシン等）
 */
export const CATEGORIES = [
  // 原価（売上原価）
  "コーヒー豆・茶葉",
  "牛乳・シロップ等",
  "フード材料費",
  "包装資材・消耗品",
  "その他原価",
  // 経費（販管費）
  "家賃",
  "水道光熱費",
  "通信費",
  "保険料",
  "消耗品費",
  "広告宣伝費",
  "修繕費",
  "その他経費",
  // 設備
  "設備（固定資産）",
  // 不明
  "不明",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Claude に返させる構造化スキーマ（1領収書 = 1オブジェクト） */
export const ReceiptSchema = z.object({
  date: z
    .string()
    .describe("領収書の日付。YYYY-MM-DD 形式。読めなければ空文字。"),
  vendor: z.string().describe("店名・支払先。読めなければ空文字。"),
  total: z
    .number()
    .describe("合計金額（税込・円）。数字のみ。読めなければ 0。"),
  category: z
    .enum(CATEGORIES)
    .describe(
      "この支出に最も近い科目を1つ選ぶ。コーヒー豆/牛乳/フード材料は原価。家賃・水道光熱費・通信費などは経費。10万円以上の機械・什器は「設備（固定資産）」。判断できなければ「不明」。",
    ),
  summary: z
    .string()
    .describe("何を買ったかの一言要約（例: コーヒー豆2kg）。"),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("抽出全体の自信度。画像が不鮮明なら low。"),
});

export type Receipt = z.infer<typeof ReceiptSchema>;
