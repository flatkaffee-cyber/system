// メニュー管理：KVに保存し、領収書登録時に仕入原価を自動更新する。
// 2026-10-26 材料を品目台帳の品目（ledgerItem）につなぎ、レシートの行から1個あたりの値段を出して更新する形に直した。
// それまでは「フード材料費」などの区分の行だけを見ていたが、区分が freee の勘定科目（仕入高など）に変わってから一度も動いていなかった。
import { getOverrides, resolveWithOverrides } from "@/lib/freeeItems";
import { unitPriceOf } from "@/lib/unitPrice";

const MENU_KEY = "menu:items";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type Ingredient = {
  name: string;
  unit: string;
  capacity: number;
  purchasePrice: number;
  usage: number;
  cost: number; // computed: (purchasePrice / capacity) * usage
  /** 品目台帳のどの品目の値段を使うか。無ければ材料名から自動で決める（linkOf） */
  ledgerItem?: string;
  /** いまの仕入値がどのレシートから来たか */
  priceFrom?: { date: string; name: string; vendor?: string };
};

/** 材料がつながる品目台帳の品目。手で決めたものが優先、無ければ材料名から判定 */
export function linkOf(ing: Pick<Ingredient, "name" | "ledgerItem">, overrides: Record<string, string>): string | null {
  return ing.ledgerItem || resolveWithOverrides(ing.name, overrides);
}

/** 新しい値段がいまの値段から大きく外れていたら、自動では入れない（1パックの量が違う品を買った可能性） */
export const isPlausiblePrice = (oldPrice: number, newPrice: number) =>
  !oldPrice || (newPrice / oldPrice <= 1.5 && newPrice / oldPrice >= 0.5);

export type MenuItem = {
  id: string;
  name: string;
  category: string;
  cost: number;
  price: number | null;
  ingredients: Ingredient[];
  recipe?: string; // 作り方
  note?: string;
  updatedAt?: string;
};

// 材料の原価を再計算
function recalcCost(ing: Ingredient): number {
  if (!ing.capacity || !ing.purchasePrice) return 0;
  return Math.round((ing.purchasePrice / ing.capacity) * ing.usage * 100) / 100;
}

export function recalcItem(item: MenuItem): MenuItem {
  const ings = item.ingredients.map((i) => ({ ...i, cost: recalcCost(i) }));
  return {
    ...item,
    ingredients: ings,
    cost: Math.round(ings.reduce((s, i) => s + i.cost, 0)),
  };
}

// ─── 初期データ ───

export const DEFAULT_MENU: MenuItem[] = [
  // ☕ Drinks (Cafe)
  {
    id: "cafe-latte", name: "カフェラテ", category: "☕ Drinks (Cafe)",
    cost: 87, price: 650,
    ingredients: [
      { name: "エスプレッソ豆", unit: "g", capacity: 360, purchasePrice: 860, usage: 17, cost: 41 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 228, usage: 200, cost: 46 },
      { name: "水", unit: "ml", capacity: 600000, purchasePrice: 4000, usage: 40, cost: 0 },
    ],
  },
  {
    id: "espresso", name: "エスプレッソ", category: "☕ Drinks (Cafe)",
    cost: 41, price: 500,
    ingredients: [
      { name: "エスプレッソ豆", unit: "g", capacity: 360, purchasePrice: 860, usage: 17, cost: 41 },
      { name: "水", unit: "ml", capacity: 600000, purchasePrice: 4000, usage: 40, cost: 0 },
    ],
  },
  {
    id: "blend-coffee", name: "ブレンドコーヒー (Hot/Ice)", category: "☕ Drinks (Cafe)",
    cost: 41, price: 550,
    ingredients: [
      { name: "エスプレッソ豆", unit: "g", capacity: 360, purchasePrice: 860, usage: 17, cost: 41 },
      { name: "水", unit: "ml", capacity: 600000, purchasePrice: 4000, usage: 40, cost: 0 },
    ],
  },
  {
    id: "tea", name: "紅茶 (Hot/Ice)", category: "☕ Drinks (Cafe)",
    cost: 21, price: 500,
    ingredients: [
      { name: "茶葉", unit: "g", capacity: 200, purchasePrice: 800, usage: 5, cost: 20 },
      { name: "水", unit: "ml", capacity: 600000, purchasePrice: 4000, usage: 200, cost: 1 },
    ],
    note: "原価は概算",
  },
  {
    id: "chai", name: "チャイ/トルコ茶", category: "☕ Drinks (Cafe)",
    cost: 68, price: 450,
    ingredients: [
      { name: "チャイ茶葉", unit: "g", capacity: 200, purchasePrice: 1200, usage: 5, cost: 30 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 228, usage: 100, cost: 23 },
      { name: "スパイス", unit: "g", capacity: 100, purchasePrice: 500, usage: 3, cost: 15 },
    ],
    note: "原価は概算",
  },
  {
    id: "matcha-latte", name: "抹茶ラテ", category: "☕ Drinks (Cafe)",
    cost: 107, price: 650,
    ingredients: [
      { name: "抹茶", unit: "g", capacity: 30, purchasePrice: 610, usage: 3, cost: 61 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 228, usage: 200, cost: 46 },
    ],
  },
  {
    id: "cocoa", name: "ココア", category: "☕ Drinks (Cafe)",
    cost: 54, price: 450,
    ingredients: [
      { name: "ココアパウダー", unit: "g", capacity: 1000, purchasePrice: 3980, usage: 5, cost: 20 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 228, usage: 150, cost: 34 },
    ],
  },
  {
    id: "oj", name: "オレンジジュース", category: "☕ Drinks (Cafe)",
    cost: 31, price: 500,
    ingredients: [
      { name: "オレンジジュース", unit: "ml", capacity: 6000, purchasePrice: 2667, usage: 70, cost: 31 },
    ],
  },

  // 🍺 Drinks (Beer)
  {
    id: "heineken", name: "ハイネケン", category: "🍺 Beer",
    cost: 274, price: 700,
    ingredients: [
      { name: "ハイネケン 330ml瓶", unit: "本", capacity: 24, purchasePrice: 6580, usage: 1, cost: 274 },
    ],
    note: "リカマンオンライン 24本×2ケース",
  },
  {
    id: "corona", name: "コロナ エキストラ", category: "🍺 Beer",
    cost: 249, price: 700,
    ingredients: [
      { name: "コロナ 330ml瓶", unit: "本", capacity: 24, purchasePrice: 5980, usage: 1, cost: 249 },
    ],
    note: "リカマンオンライン 24本×2ケース",
  },
  {
    id: "budweiser", name: "バドワイザー", category: "🍺 Beer",
    cost: 224, price: 700,
    ingredients: [
      { name: "バドワイザー 330ml瓶", unit: "本", capacity: 24, purchasePrice: 5380, usage: 1, cost: 224 },
    ],
    note: "リカマンオンライン 24本×1ケース",
  },

  // 🥤 Smoothie / Protein
  {
    id: "banana-protein", name: "バナナプロテイン", category: "🥤 Smoothie / Protein",
    cost: 159, price: 700,
    ingredients: [
      { name: "プロテインパウダー", unit: "g", capacity: 1000, purchasePrice: 4539, usage: 24, cost: 109 },
      { name: "バナナ", unit: "本", capacity: 3, purchasePrice: 120, usage: 0.5, cost: 20 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 228, usage: 130, cost: 30 },
    ],
  },
  {
    id: "cocoa-banana-protein", name: "ココアバナナプロテイン", category: "🥤 Smoothie / Protein",
    cost: 171, price: 700,
    ingredients: [
      { name: "プロテインパウダー", unit: "g", capacity: 1000, purchasePrice: 4539, usage: 24, cost: 109 },
      { name: "バナナ", unit: "本", capacity: 3, purchasePrice: 120, usage: 0.5, cost: 20 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 228, usage: 130, cost: 30 },
      { name: "ココアパウダー", unit: "g", capacity: 1000, purchasePrice: 3980, usage: 3, cost: 12 },
    ],
  },
  {
    id: "berry-banana-protein", name: "ベリーバナナプロテイン", category: "🥤 Smoothie / Protein",
    cost: 289, price: 700,
    ingredients: [
      { name: "プロテインパウダー", unit: "g", capacity: 1000, purchasePrice: 4539, usage: 24, cost: 109 },
      { name: "バナナ", unit: "本", capacity: 3, purchasePrice: 120, usage: 0.5, cost: 20 },
      { name: "牛乳(オーツ)", unit: "ml", capacity: 1000, purchasePrice: 1000, usage: 130, cost: 130 },
      { name: "ミックスベリー", unit: "g", capacity: 1500, purchasePrice: 2998, usage: 15, cost: 30 },
    ],
  },

  // 🥪 Hot Sandwich
  {
    id: "ham-cream-cheese", name: "クラシックメルト", category: "🥪 Hot Sandwich",
    cost: 129, price: 800,
    ingredients: [
      { name: "食パン", unit: "枚", capacity: 6, purchasePrice: 91, usage: 2, cost: 30 },
      { name: "切り落としハム", unit: "g", capacity: 800, purchasePrice: 905, usage: 40, cost: 45 },
      { name: "クリームチーズ", unit: "g", capacity: 227, purchasePrice: 387, usage: 15, cost: 26 },
      { name: "マスタード", unit: "g", capacity: 160, purchasePrice: 308, usage: 10, cost: 19 },
      { name: "ケチャップ", unit: "g", capacity: 500, purchasePrice: 198, usage: 10, cost: 4 },
      { name: "マーガリン", unit: "g", capacity: 900, purchasePrice: 478, usage: 10, cost: 5 },
    ],
    // 冷凍で仕込んであるので、注文ごとに中身は変えられない。
    // Uber Eatsでマスタード抜きの依頼が来たため、説明文にも書いてある。
    note: "仕込み済みのため、マスタード抜きなどの変更は受けられません",
  },
  {
    // Uber Eatsでの表示名は「ガーデンツナ」。店内は「ガーデンメルト」
    id: "tuna-broccoli", name: "ガーデンメルト", category: "🥪 Hot Sandwich",
    cost: 165, price: 800,
    ingredients: [
      { name: "食パン", unit: "枚", capacity: 6, purchasePrice: 91, usage: 2, cost: 30 },
      { name: "ツナ", unit: "缶", capacity: 1, purchasePrice: 181, usage: 0.3, cost: 54 },
      { name: "冷凍ブロッコリー", unit: "g", capacity: 500, purchasePrice: 192, usage: 30, cost: 12 },
      { name: "マヨネーズ", unit: "g", capacity: 1000, purchasePrice: 528, usage: 15, cost: 8 },
      { name: "シュレッダーチーズ", unit: "g", capacity: 1000, purchasePrice: 1242, usage: 30, cost: 37 },
      { name: "ペストロ", unit: "g", capacity: 185, purchasePrice: 321, usage: 5, cost: 9 },
      { name: "マスタード", unit: "g", capacity: 160, purchasePrice: 308, usage: 5, cost: 10 },
      { name: "マーガリン", unit: "g", capacity: 900, purchasePrice: 478, usage: 10, cost: 5 },
    ],
    note: "仕込み済みのため、マスタード抜きなどの変更は受けられません",
  },

  // 🧇 Sweets (Waffle)
  {
    id: "plain-waffle", name: "プレーンワッフル", category: "🧇 Sweets (Waffle)",
    cost: 36, price: 400, note: "1バッチ ¥358 → 50g×10枚",
    ingredients: [
      { name: "ワッフルミックス", unit: "g", capacity: 1000, purchasePrice: 847, usage: 200, cost: 169 },
      { name: "卵", unit: "個", capacity: 10, purchasePrice: 300, usage: 1, cost: 30 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 228, usage: 120, cost: 27 },
      { name: "バター（雪印 業務用450g）", unit: "g", capacity: 450, purchasePrice: 1264, usage: 40, cost: 112 },
      { name: "ざらめ", unit: "g", capacity: 1000, purchasePrice: 332, usage: 60, cost: 20 },
    ],
  },
  {
    id: "choco-chip-waffle", name: "チョコチップワッフル", category: "🧇 Sweets (Waffle)",
    cost: 38, price: 450, note: "1バッチ ¥380 → 50g×10枚",
    ingredients: [
      { name: "ワッフルミックス", unit: "g", capacity: 1000, purchasePrice: 847, usage: 200, cost: 169 },
      { name: "卵", unit: "個", capacity: 10, purchasePrice: 300, usage: 1, cost: 30 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 228, usage: 120, cost: 27 },
      { name: "バター（雪印 業務用450g）", unit: "g", capacity: 450, purchasePrice: 1264, usage: 40, cost: 112 },
      { name: "ざらめ", unit: "g", capacity: 1000, purchasePrice: 332, usage: 30, cost: 10 },
      { name: "チョコチップ", unit: "g", capacity: 500, purchasePrice: 525, usage: 30, cost: 32 },
    ],
  },
  {
    id: "matcha-waffle", name: "抹茶ワッフル", category: "🧇 Sweets (Waffle)",
    cost: 42, price: 450, note: "1バッチ ¥419 → 50g×10枚",
    ingredients: [
      { name: "ワッフルミックス", unit: "g", capacity: 1000, purchasePrice: 847, usage: 200, cost: 169 },
      { name: "卵", unit: "個", capacity: 10, purchasePrice: 300, usage: 1, cost: 30 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 228, usage: 120, cost: 27 },
      { name: "バター（雪印 業務用450g）", unit: "g", capacity: 450, purchasePrice: 1264, usage: 40, cost: 112 },
      { name: "ざらめ", unit: "g", capacity: 1000, purchasePrice: 332, usage: 60, cost: 20 },
      { name: "抹茶", unit: "g", capacity: 30, purchasePrice: 610, usage: 3, cost: 61 },
    ],
  },

  // 🍸 Bar / Cocktail（全て¥650）
  {
    id: "highball", name: "ハイボール", category: "🍸 Bar / Cocktail",
    cost: 113, price: 600,
    ingredients: [
      { name: "バーボン（JIM BEAM 4L）", unit: "ml", capacity: 4000, purchasePrice: 5825, usage: 45, cost: 66 },
      { name: "炭酸水（サンガリア185ml缶）", unit: "本", capacity: 1, purchasePrice: 47, usage: 1, cost: 47 },
    ],
  },
  {
    id: "ginger-highball", name: "ジンジャーハイボール", category: "🍸 Bar / Cocktail",
    cost: 122, price: 600,
    ingredients: [
      { name: "バーボン（JIM BEAM 4L）", unit: "ml", capacity: 4000, purchasePrice: 5825, usage: 45, cost: 66 },
      { name: "ジンジャーエール（カナダドライ）", unit: "ml", capacity: 4800, purchasePrice: 1454, usage: 185, cost: 56 },
    ],
  },
  {
    id: "coke-highball", name: "コークハイ", category: "🍸 Bar / Cocktail",
    cost: 88, price: 600,
    ingredients: [
      { name: "バーボン（JIM BEAM 4L）", unit: "ml", capacity: 4000, purchasePrice: 5825, usage: 45, cost: 66 },
      { name: "コカ・コーラ", unit: "ml", capacity: 9000, purchasePrice: 1088, usage: 185, cost: 22 },
    ],
  },
  {
    id: "gin-tonic", name: "ジントニック", category: "🍸 Bar / Cocktail",
    cost: 121, price: 600,
    ingredients: [
      { name: "ドライジン（GORDON'S）", unit: "ml", capacity: 700, purchasePrice: 1264, usage: 30, cost: 54 },
      { name: "トニックウォーター（神戸居留地185ml缶）", unit: "本", capacity: 1, purchasePrice: 67, usage: 1, cost: 67 },
    ],
  },
  {
    id: "gin-buck", name: "ジンバック", category: "🍸 Bar / Cocktail",
    cost: 132, price: 600,
    ingredients: [
      { name: "ドライジン（GORDON'S）", unit: "ml", capacity: 700, purchasePrice: 1264, usage: 30, cost: 54 },
      { name: "レモンジュース（お酒にプラス）", unit: "ml", capacity: 540, purchasePrice: 597, usage: 20, cost: 22 },
      { name: "ジンジャーエール（カナダドライ）", unit: "ml", capacity: 4800, purchasePrice: 1454, usage: 185, cost: 56 },
    ],
  },
  {
    id: "ume-lime-soda", name: "梅ライムソーダ", category: "🥤 Soft Drink",
    cost: 63, price: 650,
    ingredients: [
      { name: "梅ジュース（三田飲料 ザ・スタンダード梅 1L）", unit: "ml", capacity: 1000, purchasePrice: 843, usage: 15, cost: 13 },
      { name: "ライムジュース（ポッカ）", unit: "ml", capacity: 540, purchasePrice: 608, usage: 15, cost: 17 },
      { name: "ジンジャーエール（カナダドライ）", unit: "ml", capacity: 4800, purchasePrice: 1454, usage: 75, cost: 23 },
      { name: "ミント（自家栽培）", unit: "枚", capacity: 1, purchasePrice: 0, usage: 4, cost: 0 },
      { name: "スプライト", unit: "ml", capacity: 1500, purchasePrice: 200, usage: 75, cost: 10 },
    ],
  },
  {
    id: "yuzu-lemonade", name: "ゆずレモネード", category: "🥤 Soft Drink",
    cost: 106, price: 650,
    ingredients: [
      { name: "ゆず茶（リカマン 1kg×3）", unit: "g", capacity: 3000, purchasePrice: 3150, usage: 30, cost: 32 },
      { name: "レモンジュース（お酒にプラス）", unit: "ml", capacity: 540, purchasePrice: 597, usage: 15, cost: 17 },
      { name: "ガムシロップ（サントリー）", unit: "ml", capacity: 780, purchasePrice: 808, usage: 10, cost: 10 },
      { name: "炭酸水（サンガリア185ml缶）", unit: "本", capacity: 1, purchasePrice: 47, usage: 1, cost: 47 },
    ],
  },
  {
    id: "umeshu-soda", name: "梅ハイ", category: "📝 将来メニュー",
    cost: 112, price: 550,
    ingredients: [
      { name: "梅酒（CHOYA熟成一年）", unit: "ml", capacity: 700, purchasePrice: 1010, usage: 45, cost: 65 },
      { name: "炭酸水（サンガリア185ml缶）", unit: "本", capacity: 1, purchasePrice: 47, usage: 1, cost: 47 },
    ],
  },
  {
    id: "cassis-orange", name: "カシスオレンジ", category: "📝 将来メニュー",
    cost: 111, price: 550,
    ingredients: [
      { name: "カシスリキュール", unit: "ml", capacity: 700, purchasePrice: 1200, usage: 30, cost: 51 },
      { name: "オレンジジュース", unit: "ml", capacity: 1000, purchasePrice: 400, usage: 150, cost: 60 },
    ],
  },
  {
    id: "moscow-mule", name: "モスコミュール", category: "📝 将来メニュー",
    cost: 126, price: 550,
    ingredients: [
      { name: "ウォッカ", unit: "ml", capacity: 700, purchasePrice: 1200, usage: 45, cost: 77 },
      { name: "ジンジャーエール", unit: "ml", capacity: 4800, purchasePrice: 1454, usage: 120, cost: 36 },
      { name: "ライム", unit: "個", capacity: 1, purchasePrice: 50, usage: 0.25, cost: 13 },
    ],
  },
  {
    id: "aperol-margarita", name: "アペロールマルガリータ", category: "🍸 Original Cocktail",
    cost: 181, price: 650,
    recipe: "テキーラ26ml、アペロール30ml、ライムジュース26ml、ガムシロップ18mlをシェイク。ロックグラスに氷を入れて注ぐ。",
    ingredients: [
      { name: "テキーラ（クエルボ）", unit: "ml", capacity: 750, purchasePrice: 1892, usage: 26, cost: 66 },
      { name: "アペロール", unit: "ml", capacity: 700, purchasePrice: 1776, usage: 30, cost: 76 },
      { name: "ライムジュース（ポッカ）", unit: "ml", capacity: 540, purchasePrice: 608, usage: 26, cost: 29 },
      { name: "ガムシロップ", unit: "ml", capacity: 1000, purchasePrice: 550, usage: 18, cost: 10 },
    ],
  },
  {
    id: "berry-coconut-cloud", name: "ココナッツベリークラウド", category: "🍸 Original Cocktail",
    cost: 130, price: 650,
    ingredients: [
      { name: "ドライジン（GORDON'S）", unit: "ml", capacity: 700, purchasePrice: 1264, usage: 34, cost: 61 },
      { name: "ブラックベリーシロップ", unit: "ml", capacity: 700, purchasePrice: 1293, usage: 12, cost: 22 },
      { name: "ココナッツミルク（CHAOKOH）", unit: "ml", capacity: 9600, purchasePrice: 6880, usage: 22, cost: 16 },
      { name: "グアバジュース（グロリア）", unit: "ml", capacity: 1000, purchasePrice: 397, usage: 77, cost: 31 },
    ],
  },
  {
    id: "miami-sunset", name: "マイアミサンセット", category: "🍸 Original Cocktail",
    cost: 155, price: 650,
    ingredients: [
      { name: "バーボン（JIM BEAM 4L）", unit: "ml", capacity: 4000, purchasePrice: 5825, usage: 30, cost: 44 },
      { name: "ホワイトキュラソー（コアントロー）", unit: "ml", capacity: 700, purchasePrice: 2250, usage: 20, cost: 64 },
      { name: "オレンジジュース（ゴールドパック）", unit: "ml", capacity: 1000, purchasePrice: 378, usage: 85, cost: 32 },
      { name: "グレナデンシロップ（サントリー）", unit: "ml", capacity: 780, purchasePrice: 788, usage: 15, cost: 15 },
    ],
  },
  {
    id: "espresso-martini", name: "エスプレッソマティーニ", category: "🍸 Original Cocktail",
    cost: 119, price: 650,
    ingredients: [
      { name: "エスプレッソ豆", unit: "g", capacity: 360, purchasePrice: 860, usage: 17, cost: 41 },
      { name: "ウイスキー（JIM BEAM）", unit: "ml", capacity: 4000, purchasePrice: 6180, usage: 20, cost: 31 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 250, usage: 150, cost: 38 },
      { name: "バニラシロップ", unit: "ml", capacity: 1400, purchasePrice: 860, usage: 15, cost: 9 },
    ],
  },
  {
    id: "umeshu-mojito", name: "梅酒モヒート", category: "🍸 Original Cocktail",
    cost: 190, price: 650,
    ingredients: [
      { name: "梅酒（CHOYA熟成一年）", unit: "ml", capacity: 700, purchasePrice: 1010, usage: 30, cost: 43 },
      { name: "ジンジャーエール", unit: "ml", capacity: 4800, purchasePrice: 1454, usage: 70, cost: 21 },
      { name: "三ツ矢サイダー", unit: "ml", capacity: 5000, purchasePrice: 1400, usage: 50, cost: 14 },
      { name: "ライムジュース（ポッカ）", unit: "ml", capacity: 540, purchasePrice: 608, usage: 30, cost: 34 },
      { name: "冷凍ライムスライス", unit: "g", capacity: 500, purchasePrice: 780, usage: 50, cost: 78 },
      { name: "ミント（自家栽培）", unit: "枚", capacity: 1, purchasePrice: 0, usage: 4, cost: 0 },
    ],
  },
  {
    id: "lemon-sour", name: "レモンサワー", category: "🍸 Bar / Cocktail",
    cost: 153, price: 600,
    recipe: "①よく冷やしたグラスに氷を入れる ②レモンジュース約30mlを入れる ③ウォッカ25mlを入れる ④コアントローをティースプーン1杯(5ml)入れる ⑤ガムシロップ5mlを入れる ⑥ここまでの材料をよく撹拌する ⑦開けたてのソーダを入れる ⑧氷を持ち上げるようにして混ぜる",
    ingredients: [
      { name: "ウォッカ（アブソルート）", unit: "ml", capacity: 750, purchasePrice: 1562, usage: 25, cost: 52 },
      { name: "レモンジュース（お酒にプラス）", unit: "ml", capacity: 540, purchasePrice: 597, usage: 30, cost: 33 },
      { name: "ホワイトキュラソー（コアントロー）", unit: "ml", capacity: 700, purchasePrice: 2250, usage: 5, cost: 16 },
      { name: "ガムシロップ（サントリー）", unit: "ml", capacity: 780, purchasePrice: 808, usage: 5, cost: 5 },
      { name: "炭酸水（サンガリア185ml缶）", unit: "本", capacity: 1, purchasePrice: 47, usage: 1, cost: 47 },
    ],
  },
  {
    id: "lime-sour", name: "ライムサワー", category: "🍸 Bar / Cocktail",
    cost: 154, price: 600,
    recipe: "①よく冷やしたグラスに氷を入れる ②ライムジュース約30mlを入れる ③ウォッカ25mlを入れる ④コアントローをティースプーン1杯(5ml)入れる ⑤ガムシロップ5mlを入れる ⑥ここまでの材料をよく撹拌する ⑦開けたてのソーダを入れる ⑧氷を持ち上げるようにして混ぜる",
    ingredients: [
      { name: "ウォッカ（アブソルート）", unit: "ml", capacity: 750, purchasePrice: 1562, usage: 25, cost: 52 },
      { name: "ライムジュース（ポッカ）", unit: "ml", capacity: 540, purchasePrice: 608, usage: 30, cost: 34 },
      { name: "ホワイトキュラソー（コアントロー）", unit: "ml", capacity: 700, purchasePrice: 2250, usage: 5, cost: 16 },
      { name: "ガムシロップ（サントリー）", unit: "ml", capacity: 780, purchasePrice: 808, usage: 5, cost: 5 },
      { name: "炭酸水（サンガリア185ml缶）", unit: "本", capacity: 1, purchasePrice: 47, usage: 1, cost: 47 },
    ],
  },
  {
    id: "grapefruit-sour", name: "グレープフルーツサワー", category: "🍸 Bar / Cocktail",
    cost: 153, price: 600,
    recipe: "①よく冷やしたグラスに氷を入れる ②グレープフルーツジュース約30mlを入れる ③ウォッカ25mlを入れる ④コアントローをティースプーン1杯(5ml)入れる ⑤ガムシロップ5mlを入れる ⑥ここまでの材料をよく撹拌する ⑦開けたてのソーダを入れる ⑧氷を持ち上げるようにして混ぜる",
    ingredients: [
      { name: "ウォッカ（アブソルート）", unit: "ml", capacity: 750, purchasePrice: 1562, usage: 25, cost: 52 },
      { name: "グレープフルーツジュース（ポッカお酒にプラス）", unit: "ml", capacity: 540, purchasePrice: 597, usage: 30, cost: 33 },
      { name: "ホワイトキュラソー（コアントロー）", unit: "ml", capacity: 700, purchasePrice: 2250, usage: 5, cost: 16 },
      { name: "ガムシロップ（サントリー）", unit: "ml", capacity: 780, purchasePrice: 808, usage: 5, cost: 5 },
      { name: "炭酸水（サンガリア185ml缶）", unit: "本", capacity: 1, purchasePrice: 47, usage: 1, cost: 47 },
    ],
  },
];

// ─── CRUD ───

export async function getMenuItems(): Promise<MenuItem[]> {
  const store = await kv();
  if (!store) return DEFAULT_MENU;
  const saved = await store.get<MenuItem[]>(MENU_KEY);
  return saved && saved.length > 0 ? saved : DEFAULT_MENU;
}

export async function saveMenuItems(items: MenuItem[]): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  await store.set(MENU_KEY, items);
}

export async function upsertMenuItem(item: MenuItem): Promise<void> {
  const items = await getMenuItems();
  const idx = items.findIndex((i) => i.id === item.id);
  const updated = recalcItem({ ...item, updatedAt: new Date().toISOString() });
  if (idx >= 0) {
    items[idx] = updated;
  } else {
    items.push(updated);
  }
  await saveMenuItems(items);
}

export async function deleteMenuItem(id: string): Promise<void> {
  const items = await getMenuItems();
  await saveMenuItems(items.filter((i) => i.id !== id));
}

// ─── 領収書から仕入値自動更新 ───
// 領収書の品目名に材料名が含まれていたら、単価を更新する。
// 例: 「コーヒー豆2kg」→ エスプレッソ豆の仕入値を更新

/**
 * 領収書が保存されたとき、行ごとに品目を判定し、その品目につながっている材料の仕入値（1個あたり）を更新する。
 * 値段が今の半分未満・1.5倍超のときは自動では入れない（メニュー → 原価の見直し で確かめて入れる）。
 * 呼び出し元: saveReceipt の後。
 */
export async function updateCostsFromReceipt(receipt: {
  summary: string;
  total: number;
  category: string;
  date?: string;
  vendor?: string;
  lines?: { name: string; amount: number; category: string }[];
}): Promise<{ updated: string[]; skipped: boolean }> {
  const lines = receipt.lines ?? [
    { name: receipt.summary, amount: receipt.total, category: receipt.category },
  ];
  const overrides = await getOverrides().catch(() => ({}));
  const priced = lines
    .map((l) => ({ line: l, item: resolveWithOverrides(l.name, overrides), ...unitPriceOf(l.name, l.amount) }))
    .filter((x) => x.item && x.price > 0);
  if (!priced.length) return { updated: [], skipped: true };

  const items = await getMenuItems();
  const updatedNames: string[] = [];
  let changed = false;
  for (const p of priced) {
    for (const item of items) {
      for (const ing of item.ingredients) {
        if (linkOf(ing, overrides) !== p.item) continue;
        if (p.price === ing.purchasePrice || !isPlausiblePrice(ing.purchasePrice, p.price)) continue;
        ing.purchasePrice = p.price;
        ing.priceFrom = { date: receipt.date ?? new Date().toISOString().slice(0, 10), name: p.line.name, vendor: receipt.vendor };
        changed = true;
        if (!updatedNames.includes(ing.name)) updatedNames.push(ing.name);
      }
    }
  }
  if (changed) await saveMenuItems(items.map(recalcItem));
  return { updated: updatedNames, skipped: false };
}

/** 同じ名前の材料を、全部のメニューでまとめて直す（原価の見直しの画面から） */
export async function updateIngredient(
  name: string,
  patch: { ledgerItem?: string | null; purchasePrice?: number; priceFrom?: Ingredient["priceFrom"] },
): Promise<number> {
  const items = await getMenuItems();
  let n = 0;
  for (const item of items) {
    for (const ing of item.ingredients) {
      if (ing.name !== name) continue;
      if (patch.ledgerItem === null) delete ing.ledgerItem;
      else if (patch.ledgerItem !== undefined) ing.ledgerItem = patch.ledgerItem;
      if (patch.purchasePrice !== undefined && patch.purchasePrice > 0) {
        ing.purchasePrice = patch.purchasePrice;
        ing.priceFrom = patch.priceFrom;
      }
      n++;
    }
  }
  if (n) await saveMenuItems(items.map(recalcItem));
  return n;
}
