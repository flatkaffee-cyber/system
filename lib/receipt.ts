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

/** レシートの1行（内訳）。用途/科目が違う品目は行を分ける。 */
export const ReceiptLineSchema = z.object({
  name: z.string().describe("品目・内容（例: 木材、コーヒー豆2kg）。"),
  amount: z.number().describe("この品目の税込金額（円）。"),
  category: z
    .enum(CATEGORIES)
    .describe(
      "科目。コーヒー豆/牛乳/フード材料は原価。家賃・水道光熱費・通信費などは経費。10万円以上の機械・什器は「設備（固定資産）」。判断できなければ「不明」。",
    ),
  tags: z
    .array(z.string())
    .describe(
      "用途タグ（家具費, コーヒー器具, 開業準備, 販促 等）。既存タグに合うものがあれば必ずそれを使う（表記統一）。無ければ簡潔な新タグ。",
    ),
});

/** Claude に返させる構造化スキーマ（1領収書）。内訳を lines に分けて返す。 */
export const ReceiptSchema = z.object({
  date: z
    .string()
    .describe("領収書の日付。YYYY-MM-DD 形式。読めなければ空文字。"),
  vendor: z.string().describe("店名・支払先。読めなければ空文字。"),
  total: z
    .number()
    .describe("合計金額（税込・円）。数字のみ。読めなければ 0。"),
  lines: z
    .array(ReceiptLineSchema)
    .describe(
      "レシートの内訳。**用途や科目が違う品目は行を分ける**（例: 木材＝家具費／コーヒー豆＝仕入）。基本は1行、混在時のみ複数行。各行の金額合計＝total。",
    ),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("抽出全体の自信度。画像が不鮮明なら low。"),
});

export type ReceiptLine = z.infer<typeof ReceiptLineSchema>;
export type Receipt = z.infer<typeof ReceiptSchema>;
