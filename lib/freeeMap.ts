// 領収書の科目(CATEGORIES) → freeeの勘定科目ID/税区分/品目ID のマッピング。
// company_id=12575763 の実IDを埋め込み。tax_code 34=課対仕入10%、2=対象外。

export const YAKUIN_KARIIRE_ID = 1035440156; // 役員借入金（貸方）
export const YAKUIN_KARIIRE_TAX = 2; // 対象外

// 原価品目のID
const ITEM = {
  coffee: 252404478, // コーヒー豆・茶葉
  milk: 252404480, // 牛乳・シロップ等
  food: 252404481, // フード材料費
  pack: 252404482, // 包装資材・消耗品
  other: 252404483, // その他原価
};

export type FreeeLine = {
  accountItemId: number;
  taxCode: number;
  itemId?: number;
};

// 領収書のカテゴリ名 → 借方の科目
export const CATEGORY_MAP: Record<string, FreeeLine> = {
  // 原価 → 仕入高(1035440079) ＋ 品目
  "コーヒー豆・茶葉": { accountItemId: 1035440079, taxCode: 34, itemId: ITEM.coffee },
  "牛乳・シロップ等": { accountItemId: 1035440079, taxCode: 34, itemId: ITEM.milk },
  "フード材料費": { accountItemId: 1035440079, taxCode: 34, itemId: ITEM.food },
  "包装資材・消耗品": { accountItemId: 1035440079, taxCode: 34, itemId: ITEM.pack },
  "その他原価": { accountItemId: 1035440079, taxCode: 34, itemId: ITEM.other },
  // 経費
  "家賃": { accountItemId: 1035440112, taxCode: 34 }, // 地代家賃
  "水道光熱費": { accountItemId: 1035440107, taxCode: 34 },
  "通信費": { accountItemId: 1035440101, taxCode: 34 },
  "保険料": { accountItemId: 1035440115, taxCode: 2 }, // 非課税
  "消耗品費": { accountItemId: 1035440104, taxCode: 34 },
  "広告宣伝費": { accountItemId: 1035440097, taxCode: 34 },
  "修繕費": { accountItemId: 1035440106, taxCode: 34 },
  "その他経費": { accountItemId: 1035440125, taxCode: 34 }, // 雑費
  // 設備
  "設備（固定資産）": { accountItemId: 1035440008, taxCode: 34 }, // 工具器具備品
  // 不明 → 仮払金（後で振替）
  "不明": { accountItemId: 1035439999, taxCode: 2 },
};

export function mapCategory(category: string): FreeeLine {
  return CATEGORY_MAP[category] ?? CATEGORY_MAP["不明"];
}
