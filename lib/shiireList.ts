// 仕入れ表（何をどこでいくらで買うか）。Supabase の shiire_items に持つ。
// 2026-10-26 まではGoogleスプレッドシートを毎回読んでいたが、Googleの連携が切れると見られなくなるので移した。
// 表は supabase/migrations/20261026000000_shiire_items.sql。
import { db, isDbReady } from "@/lib/freeeMirror/db";
import type { Section as SheetSection } from "@/lib/inventorySheet";

export type ShiireItem = {
  id: number;
  section: string;
  name: string;
  supplier: string;
  url: string;
  /** 税込・円。分からなければ null */
  price: number | null;
  capacity: string;
  note: string;
  orderQty: string;
  sort: number;
};
export type ShiireSection = { title: string; rows: ShiireItem[] };

/** 見出しの並び（スプレッドシートの並びのまま）。ここに無い見出しは後ろに名前順 */
const SECTION_ORDER = ["ドリンク", "ドリンク（酒）", "冷凍", "ワッフル", "消耗品・包材", "フード"];

type Row = {
  id: number; section: string; name: string; supplier: string; url: string; price: number | null;
  capacity: string; note: string; order_qty: string; sort: number;
};
const fromRow = (r: Row): ShiireItem => ({
  id: r.id, section: r.section, name: r.name, supplier: r.supplier, url: r.url, price: r.price,
  capacity: r.capacity, note: r.note, orderQty: r.order_qty, sort: r.sort,
});

export { isDbReady };

export async function listShiire(): Promise<ShiireSection[]> {
  const { data, error } = await db().from("shiire_items").select("*").order("sort").order("id");
  if (error) throw new Error(error.message);
  const by = new Map<string, ShiireItem[]>();
  for (const r of (data ?? []) as Row[]) {
    const it = fromRow(r);
    (by.get(it.section) ?? by.set(it.section, []).get(it.section)!).push(it);
  }
  const rank = (t: string) => (SECTION_ORDER.includes(t) ? SECTION_ORDER.indexOf(t) : 100);
  return [...by.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, "ja"))
    .map(([title, rows]) => ({ title, rows }));
}

/** 価格の文字（"8298"・"¥1,400"・"" など）を円の数に。数でなければ null */
export function parsePrice(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).normalize("NFKC").replace(/[¥,\s円]/g, "");
  return /^\d+$/.test(s) ? Number(s) : null;
}

export type ShiireInput = Partial<Omit<ShiireItem, "id">> & { id?: number };

export async function saveShiire(it: ShiireInput): Promise<ShiireItem> {
  const row: Record<string, unknown> = {
    ...(it.section !== undefined ? { section: it.section.trim() } : {}),
    ...(it.name !== undefined ? { name: it.name.trim() } : {}),
    ...(it.supplier !== undefined ? { supplier: it.supplier.trim() } : {}),
    ...(it.url !== undefined ? { url: it.url.trim() } : {}),
    ...(it.price !== undefined ? { price: it.price } : {}),
    ...(it.capacity !== undefined ? { capacity: it.capacity.trim() } : {}),
    ...(it.note !== undefined ? { note: it.note.trim() } : {}),
    ...(it.orderQty !== undefined ? { order_qty: it.orderQty.trim() } : {}),
    ...(it.sort !== undefined ? { sort: it.sort } : {}),
    updated_at: new Date().toISOString(),
  };
  const q = it.id
    ? db().from("shiire_items").update(row).eq("id", it.id).select().single()
    : db().from("shiire_items").insert(row).select().single();
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return fromRow(data as Row);
}

export async function deleteShiire(id: number): Promise<void> {
  const { error } = await db().from("shiire_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * スプレッドシートの中身を取り込む（1回だけ使う移行用）。表が空のときだけ入れる。
 * 価格が数でないもの（「要確認」など）は価格を空にして、メモの頭に元の文字を残す
 */
export async function importFromSheet(sections: SheetSection[]): Promise<number> {
  const { count, error: e1 } = await db().from("shiire_items").select("id", { count: "exact", head: true });
  if (e1) throw new Error(e1.message);
  if ((count ?? 0) > 0) throw new Error("仕入れ表にもう品目があるので取り込みません（二重になるため）");
  const rows = sections.flatMap((s) =>
    s.rows.map((r, i) => {
      const price = parsePrice(r.price);
      return {
        section: s.title,
        name: r.name,
        supplier: r.supplier,
        url: r.url,
        price,
        capacity: r.capacity,
        note: price === null && r.price ? `価格: ${r.price}${r.note ? `／${r.note}` : ""}` : r.note,
        order_qty: r.orderQty,
        sort: i,
      };
    }),
  );
  if (!rows.length) return 0;
  const { error } = await db().from("shiire_items").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}
