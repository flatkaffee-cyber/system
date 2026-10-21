// 物販（Tシャツなど）を Square に登録する。
//
// ネットショップ（Square オンラインビジネス）は Square の商品ライブラリから商品を取り込む。
// ここで商品・写真・サイズごとの在庫を入れておけば、あとは Square データの商品で
// 「Square オンライン」をオンにするだけで売れる。そのスイッチは API から書けない
// （channels は読み取り専用）ので、画面で案内する。
//
// 在庫は店のレジと共通。店頭で売れた分もネットの在庫から減る。

import { listCategories, createCategory, listItems } from "@/lib/squareCatalog";

const API = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-11-20";

/** 物販の商品をまとめる Square のカテゴリ。売上の「物販」とも名前をそろえる */
export const GOODS_CATEGORY = "物販";

function auth() {
  return {
    "Square-Version": SQUARE_VERSION,
    Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN || ""}`,
  };
}

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...auth(), "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.errors?.[0]?.detail || `Square API エラー(${res.status})`);
  }
  return data;
}

async function locationId(): Promise<string> {
  const d = await call("/locations");
  const id = d.locations?.[0]?.id;
  if (!id) throw new Error("Square の店舗が見つかりません");
  return id;
}

async function goodsCategoryId(): Promise<string> {
  const found = (await listCategories()).find((c) => c.name === GOODS_CATEGORY);
  return found ? found.id : (await createCategory(GOODS_CATEGORY)).id;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type GoodsSize = { name: string; qty: number };

export type GoodsInput = {
  name: string;
  price: number;
  description?: string;
  sizes: GoodsSize[];
};

/** 入力を確かめる。問題があれば日本語の文を返す */
export function validateGoods(b: Partial<GoodsInput>): string | null {
  if (!b.name?.trim()) return "商品名を入れてください";
  if (!Number.isInteger(b.price) || (b.price as number) <= 0) return "値段は1円以上の整数で入れてください";
  const sizes = b.sizes ?? [];
  if (!sizes.length) return "サイズを1つ以上入れてください";
  const names = sizes.map((s) => s.name?.trim());
  if (names.some((n) => !n)) return "サイズの名前が空の行があります";
  if (new Set(names).size !== names.length) return "同じ名前のサイズが2つあります";
  if (sizes.some((s) => !Number.isInteger(s.qty) || s.qty < 0)) return "在庫は0以上の整数で入れてください";
  return null;
}

export type CreatedGoods = {
  itemId: string;
  name: string;
  sizes: { variationId: string; name: string; qty: number }[];
  /** 商品はできたが在庫の書き込みに失敗したとき */
  stockError?: string;
};

/**
 * 商品を1つ作る。サイズはそれぞれ Square の「種類（バリエーション）」になり、
 * 在庫を数える設定にしたうえで、入れた枚数を棚卸しとして書き込む。
 */
export async function createGoods(input: GoodsInput): Promise<CreatedGoods> {
  const [loc, categoryId] = await Promise.all([locationId(), goodsCategoryId()]);
  const key = Date.now().toString(36);
  const sizes = input.sizes.map((s) => ({ name: s.name.trim(), qty: s.qty }));

  const item_data: Record<string, unknown> = {
    name: input.name.trim(),
    product_type: "REGULAR",
    categories: [{ id: categoryId }],
    reporting_category: { id: categoryId },
    variations: sizes.map((s, i) => ({
      type: "ITEM_VARIATION",
      id: `#goodsvar_${key}_${i}`,
      item_variation_data: {
        name: s.name,
        pricing_type: "FIXED_PRICING",
        price_money: { amount: input.price, currency: "JPY" },
        track_inventory: true,
        sellable: true,
        stockable: true,
      },
    })),
  };
  const desc = input.description?.trim();
  if (desc) {
    item_data.description_html = `<p>${escapeHtml(desc).replace(/\n/g, "<br>")}</p>`;
  }

  const d = await call("/catalog/object", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: `goods_${key}`,
      object: { type: "ITEM", id: `#goods_${key}`, item_data },
    }),
  });
  const item = d.catalog_object;
  const vars: { id: string; name: string }[] = (item?.item_data?.variations ?? []).map((v: any) => ({
    id: v.id,
    name: v.item_variation_data?.name ?? "",
  }));
  const created: CreatedGoods = {
    itemId: item.id,
    name: item.item_data?.name ?? input.name,
    sizes: vars.map((v) => ({
      variationId: v.id,
      name: v.name,
      qty: sizes.find((s) => s.name === v.name)?.qty ?? 0,
    })),
  };

  try {
    const now = new Date().toISOString();
    await call("/inventory/changes/batch-create", {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: `goodsstock_${key}`,
        ignore_unchanged_counts: false,
        changes: created.sizes.map((s) => ({
          type: "PHYSICAL_COUNT",
          physical_count: {
            catalog_object_id: s.variationId,
            state: "IN_STOCK",
            location_id: loc,
            quantity: String(s.qty),
            occurred_at: now,
          },
        })),
      }),
    });
  } catch (e) {
    created.stockError = e instanceof Error ? e.message : "在庫の書き込みに失敗";
  }
  return created;
}

/**
 * 写真を1枚、商品に付ける。primary なら一番目（ネットショップの一覧に出る写真）になる。
 * 送るのは multipart で、JSON を request、画像を file に入れる。
 */
export async function attachGoodsImage(
  itemId: string,
  file: Blob,
  filename: string,
  caption: string,
  primary: boolean,
): Promise<{ imageId: string; url: string | null }> {
  const form = new FormData();
  const request = {
    idempotency_key: `goodsimg_${itemId.slice(-8)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    object_id: itemId,
    is_primary: primary,
    image: { type: "IMAGE", id: "#goodsimg", image_data: { caption } },
  };
  form.append("request", new Blob([JSON.stringify(request)], { type: "application/json" }));
  form.append("file", file, filename);

  const res = await fetch(`${API}/catalog/images`, { method: "POST", headers: auth(), body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.errors?.[0]?.detail || `写真の登録に失敗(${res.status})`);
  }
  return { imageId: data.image?.id, url: data.image?.image_data?.url ?? null };
}

export type GoodsListItem = {
  id: string;
  name: string;
  sizes: { id: string; name: string; price: number | null; qty: number | null }[];
};

/** 物販カテゴリの商品と、サイズごとのいまの在庫 */
export async function listGoods(): Promise<GoodsListItem[]> {
  const items = (await listItems()).filter((i) => i.category === GOODS_CATEGORY);
  const ids = items.flatMap((i) => i.variations.map((v) => v.id));
  const counts: Record<string, number> = {};
  if (ids.length) {
    const loc = await locationId();
    let cursor: string | undefined;
    do {
      const d = await call("/inventory/counts/batch-retrieve", {
        method: "POST",
        body: JSON.stringify({
          catalog_object_ids: ids,
          location_ids: [loc],
          states: ["IN_STOCK"],
          ...(cursor ? { cursor } : {}),
        }),
      });
      for (const c of d.counts ?? []) counts[c.catalog_object_id] = Number(c.quantity);
      cursor = d.cursor;
    } while (cursor);
  }
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    sizes: i.variations.map((v) => ({
      id: v.id,
      name: v.name,
      price: v.price,
      qty: v.id in counts ? counts[v.id] : null,
    })),
  }));
}
