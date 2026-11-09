import { NextRequest, NextResponse } from "next/server";
import { EXCLUDE_WINDOWS, excludeOf } from "@/lib/salesEvents";
import { getReceipts, receiptLines } from "@/lib/receipts";
import { getMenuItems } from "@/lib/menu";
import { getFixes } from "@/lib/salesFix";
import { listItems } from "@/lib/squareCatalog";
import { getHidden } from "@/lib/menuAdmin";

// 終わったイベントの参加費や、もう使わない差額用の商品。売れていなくても一覧に出さない
const RETIRED_PRODUCT = /参加費|花火|パーティのみ|（旧）|差額/;
// パーティ・イベント用の商品。普段のメニューの分析には出さない（2026-11-09 坂本さん）。
// 「ドリンク3杯のお得セット」は飲み放題の分類だが普段も売るので、分類ではなく名前で外す
const PARTY_CATEGORY = new Set(["🎆 パーティ参加費", "🌵 テキーラ", "🍿 スナック", "メニュー未記載"]);
const PARTY_NAME = /飲み放題|エントランス|場所代|ショット|テキーラ/;

// 前の名前・表記ゆれ → 今の商品名（と種類）。2026-11-09 坂本さんの指摘（アイスティーは紅茶のIce、サンデーが2つある など）
const NAME_ALIAS: Record<string, { name: string; variant?: string }> = {
  アイスティー: { name: "紅茶", variant: "Ice" },
  ゆずレモネード: { name: "柚子レモネード" },
  "WABI-SABI Shrimp": { name: "Wabi-Sabi Shrimp" },
  ベリーココナッツクラウド: { name: "ココナッツベリークラウド" },
  ジャスミンハイ: { name: "ジャスミン茶ハイ" },
  ウーロンハイ: { name: "烏龍茶ハイ" },
  "キリン一番搾り(中瓶)": { name: "キリン一番搾り（中瓶）" },
  "抹茶ラテ（ソイ）": { name: "抹茶ラテ" },
  "はちみつブルーチーズ・生ハム・クラッカーの盛合せ": { name: "ブルーチーズと生ハム盛り合わせ" },
  "オリーブ・ザワークラウト・マッシュポテトの盛合せ": { name: "オリーブ・ザワークラウト・マッシュポテトの3種盛り" },
};
/** 今の商品名にそろえる。「スペシャルワッフルサンデー（チョコ/抹茶）」のような種類つきの前の名前は、元の商品にまとめる */
function canonicalName(raw: string): { name: string; variant?: string } {
  const n = raw.trim();
  if (NAME_ALIAS[n]) return NAME_ALIAS[n];
  const m = /^(.+?)（[^）]*\/[^）]*）$/.exec(n);
  if (m) return { name: m[1].trim() };
  return { name: n };
}

// ホットサンドとドリンクを選ぶセット（ドリンク3杯のお得セットは入れない）
const SET_LINE = /^(ドリンクセット|フルセット|スープセット|スープセットorフルセット)$/;
// セットのドリンクの書き方（lib/setMenu の SET_DRINKS）→ 商品名と種類
const SET_DRINK_NAME: Record<string, string> = {
  チョコミルク: "チョコレートミルク",
  オレンジ: "オレンジジュース",
  パイナップル: "パイナップルジュース",
  グアバ: "グアバジュース",
  コーラ: "コカ・コーラ",
  烏龍茶: "ウーロン茶",
};
const SET_DRINK_BASES = new Set([
  "エスプレッソ", "アメリカーノ", "カフェラテ", "ドリップコーヒー", "コールドブリュー", "エスプレッソトニック",
  "抹茶ラテ", "チョコミルク", "梅ライムソーダ", "柚子レモネード", "紅茶", "烏龍茶", "ジャスミン茶",
  "オレンジ", "パイナップル", "グアバ", "コーラ", "ジンジャーエール",
]);
function setDrinkOf(t: string): { name: string; variant?: string } | null {
  const m = /^(.+?)(HOT|ICE)$/i.exec(t);
  const base = m ? m[1] : t;
  if (!SET_DRINK_BASES.has(base)) return null;
  return { name: SET_DRINK_NAME[base] ?? base, variant: m ? (m[2].toUpperCase() === "HOT" ? "Hot" : "Ice") : undefined };
}

export const runtime = "nodejs";
export const maxDuration = 60;

const SQUARE_API = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-11-20";

function hdrs() {
  return {
    "Square-Version": SQUARE_VERSION,
    Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN || ""}`,
    "Content-Type": "application/json",
  };
}

async function getLocationId(): Promise<string> {
  const res = await fetch(`${SQUARE_API}/locations`, { headers: hdrs() });
  const data = await res.json();
  return data.locations?.[0]?.id || "";
}

// 原価を持たない売上。イベントの入場・飲み放題の券と、品目の無い金額だけの注文（不明）
const NO_COST_PRODUCT = /^(不明|エントランス|飲み放題|花火|パーティ)/;

// 指定期間のCOMPLETED注文をSquareから全件取得
async function fetchOrders(beginISO: string, endISO: string) {
  const locationId = await getLocationId();
  if (!locationId) return [];
  const all: any[] = [];
  let cursor: string | undefined;
  do {
    const body: any = {
      location_ids: [locationId],
      query: {
        filter: {
          date_time_filter: { created_at: { start_at: beginISO, end_at: endISO } },
          state_filter: { states: ["COMPLETED"] },
        },
        sort: { sort_field: "CREATED_AT", sort_order: "ASC" },
      },
    };
    if (cursor) body.cursor = cursor;
    const res = await fetch(`${SQUARE_API}/orders/search`, {
      method: "POST", headers: hdrs(), body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) break;
    all.push(...(data.orders || []));
    cursor = data.cursor;
  } while (cursor);
  return all;
}

// GET /api/analytics?from=2026-08-01&to=2026-08-15&withEvents=1
//   withEvents=1 を付けると通常営業でない日も混ぜる。既定では外して平常日だけを見る。
// 売上（Square）・支出（領収書）・商品別粗利（原価表と突き合わせ）を一括で返す。
// 経営判断用。freeeに登録済みかどうかは問わず、領収書の全件を支出として扱う。
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const from = searchParams.get("from") || today.slice(0, 8) + "01";
    const to = searchParams.get("to") || today;
    // 既定では通常営業でない日を外す。傾向を見るのが目的のため
    const withEvents = searchParams.get("withEvents") === "1";

    // 営業日は朝6時切替
    const beginISO = new Date(`${from}T06:00:00+09:00`).toISOString();
    const endD = new Date(`${to}T06:00:00+09:00`);
    endD.setDate(endD.getDate() + 1);
    const endISO = endD.toISOString();

    const [orders, receipts, menu, itemFixes] = await Promise.all([
      fetchOrders(beginISO, endISO),
      getReceipts(),
      getMenuItems(),
      // カード会計はSquareのレジに金額だけ渡すので、Square側の注文には品目が残らない。
      // 会計のときに写しておいた品目（lib/salesFix）で置き換える。売上の画面と同じやり方
      getFixes().catch(() => ({} as Awaited<ReturnType<typeof getFixes>>)),
    ]);

    // ── 売上side ──────────────────────────────
    // カタログID→原価のマップ（バリエーション名は追えないので商品名で引く）
    const costByName: Record<string, number> = {};
    for (const m of menu) {
      costByName[m.name] = m.cost;
      for (const alias of m.aliases ?? []) costByName[alias] = m.cost;
    }

    let totalSales = 0, totalTax = 0;
    const byDay: Record<string, { sales: number; count: number }> = {};
    // months: 商品ごとの月別の数と売上（分析ページで商品を開いたときに出す）
    // days: 商品ごとの日別の数と売上（分析ページのグラフで、月・週・曜日に束ね直す）
    type ProductAgg = {
      qty: number; amount: number; cost: number;
      months: Record<string, { qty: number; amount: number; cost: number }>;
      days: Record<string, { qty: number; amount: number }>;
    };
    const byProduct: Record<string, ProductAgg> = {};
    const addProduct = (name: string, day: string, qty: number, amount: number, cost: number) => {
      const p = (byProduct[name] = byProduct[name] || { qty: 0, amount: 0, cost: 0, months: {}, days: {} });
      p.qty += qty;
      p.amount += amount;
      p.cost += cost;
      const m = (p.months[day.slice(0, 7)] = p.months[day.slice(0, 7)] || { qty: 0, amount: 0, cost: 0 });
      m.qty += qty;
      m.amount += amount;
      m.cost += cost;
      const d = (p.days[day] = p.days[day] || { qty: 0, amount: 0 });
      d.qty += qty;
      d.amount += amount;
    };
    // 種類ごと（ワッフルのチョコ・抹茶、Hot/Iceなど）。商品名 → 種類名 → 集計。
    // カード会計の写しは 2026-11-09 まで種類を持っていないので、その分は「種類が分からない」に入る
    const byVariant: Record<string, Record<string, ProductAgg>> = {};
    const addVariant = (name: string, vname: string, day: string, qty: number, amount: number, cost: number) => {
      const vs = (byVariant[name] = byVariant[name] || {});
      const p = (vs[vname] = vs[vname] || { qty: 0, amount: 0, cost: 0, months: {}, days: {} });
      p.qty += qty;
      p.amount += amount;
      p.cost += cost;
      const m = (p.months[day.slice(0, 7)] = p.months[day.slice(0, 7)] || { qty: 0, amount: 0, cost: 0 });
      m.qty += qty;
      m.amount += amount;
      m.cost += cost;
      const d = (p.days[day] = p.days[day] || { qty: 0, amount: 0 });
      d.qty += qty;
      d.amount += amount;
    };
    const byTender: Record<string, { count: number; amount: number }> = {};
    // 時間帯別・曜日別（バイトのシフトをどこに入れるかの判断材料）。
    // 「営業した日数」で割って1日平均を出すため、時間帯ごとに日付も集める。
    const byHour: Record<number, { sales: number; count: number; days: Set<string> }> = {};
    const byWeekday: Record<number, { sales: number; count: number; days: Set<string> }> = {};
    const byMonth: Record<string, { sales: number; count: number; days: Set<string> }> = {};
    // 外したイベント分。除外した額が分かるように別で持つ
    const eventSales: Record<string, { sales: number; count: number; reason: string }> = {};

    for (const o of orders) {
      const amt = o.total_money?.amount || 0;
      const jst = new Date(new Date(o.created_at).getTime() + 9 * 3600_000);
      // 6時前は前営業日に付ける
      if (jst.getUTCHours() < 6) jst.setUTCDate(jst.getUTCDate() - 1);
      const day = jst.toISOString().slice(0, 10);

      // 実際の時刻（営業日への繰り上げ前の時刻を使う。25時台は1時として扱う）
      const realJst = new Date(new Date(o.created_at).getTime() + 9 * 3600_000);
      const hour = realJst.getUTCHours();

      const ex = excludeOf(day, hour);
      if (ex && !withEvents) {
        const k = ex.label;
        eventSales[k] = eventSales[k] || { sales: 0, count: 0, reason: ex.reason };
        eventSales[k].sales += amt;
        eventSales[k].count += 1;
        continue; // 平常日の集計には入れない
      }

      totalSales += amt;
      totalTax += o.total_tax_money?.amount || 0;

      byDay[day] = byDay[day] || { sales: 0, count: 0 };
      byDay[day].sales += amt;
      byDay[day].count += 1;
      byHour[hour] = byHour[hour] || { sales: 0, count: 0, days: new Set() };
      byHour[hour].sales += amt;
      byHour[hour].count += 1;
      byHour[hour].days.add(day);

      const wd = new Date(day + "T00:00:00Z").getUTCDay(); // 0=日
      byWeekday[wd] = byWeekday[wd] || { sales: 0, count: 0, days: new Set() };
      byWeekday[wd].sales += amt;
      byWeekday[wd].count += 1;
      byWeekday[wd].days.add(day);

      const mon = day.slice(0, 7);
      byMonth[mon] = byMonth[mon] || { sales: 0, count: 0, days: new Set() };
      byMonth[mon].sales += amt;
      byMonth[mon].count += 1;
      byMonth[mon].days.add(day);

      const fixed = itemFixes[o.id];
      const lines: any[] = fixed?.length
        ? fixed.map((f) => ({ name: f.name, variation_name: f.variation, note: f.note, quantity: String(f.qty), total_money: { amount: f.amount } }))
        : o.line_items || [];
      for (const li of lines) {
        // 前の名前・表記ゆれは今の商品名にまとめる（アイスティー → 紅茶のIce など）
        const canon = canonicalName(li.name || "不明");
        const name = canon.name;
        const qty = parseInt(li.quantity) || 1;
        addProduct(name, day, qty, li.total_money?.amount || 0, (costByName[name] || 0) * qty);
        if (SET_LINE.test(name)) {
          // セット（スープセット・ドリンクセット・フルセット）の中のホットサンドとドリンクも、それぞれの数に入れる。
          // 例 ドリンクセットのカフェラテICE → カフェラテ（Ice）が1杯。セットの数もそのまま数える（2026-11-09 坂本さん）。
          // 金額はセットの行に付いているので、ここでは数（ホットサンドは原価も）だけ足す。
          // ホットサンドは「種類」、ドリンクは「メモ」（クラシックメルト／カフェラテICE）に入っている。
          // 10月の前のドリンクセットは、ドリンクが「種類」に入っていた
          const tokens = new Set(
            [String(li.variation_name || ""), ...String(li.note || "").split(/[／/]/)].map((t) => t.trim()).filter(Boolean),
          );
          for (const t of tokens) {
            if (t === "クラシックメルト" || t === "ガーデンメルト") {
              addProduct(t, day, qty, 0, (costByName[t] || 0) * qty);
              continue;
            }
            const dr = setDrinkOf(t);
            if (dr) {
              addProduct(dr.name, day, qty, 0, 0);
              addVariant(dr.name, dr.variant ?? "種類が分からない", day, qty, 0, 0);
            }
          }
        } else {
          // 種類。「Regular」は種類の無い商品なので数えない。名前と同じものも同じ
          const vn = String(li.variation_name || "").trim();
          const vname = canon.variant ?? (!vn || vn === name || vn === "Regular" || vn === li.name ? "種類が分からない" : vn);
          addVariant(name, vname, day, qty, li.total_money?.amount || 0, (costByName[name] || 0) * qty);
        }
      }
      for (const t of o.tenders || []) {
        const key = t.type === "CASH" ? "現金" : t.type === "CARD" ? "カード"
          : t.note || t.other_details?.source || "その他";
        byTender[key] = byTender[key] || { count: 0, amount: 0 };
        byTender[key].count += 1;
        byTender[key].amount += t.amount_money?.amount || 0;
      }
    }

    // ── 支出side（領収書）─────────────────────
    // 期間内の領収書を科目・用途タグで集計
    const inRange = receipts.filter((r) => r.date >= from && r.date <= to);
    let totalExpense = 0, cogs = 0;
    const byCategory: Record<string, number> = {};
    const byTag: Record<string, number> = {};
    for (const r of inRange) {
      for (const l of receiptLines(r)) {
        const a = l.amount || 0;
        totalExpense += a;
        const cat = l.category || "不明";
        byCategory[cat] = (byCategory[cat] || 0) + a;
        if (cat === "仕入高") cogs += a;
        for (const t of l.tags || []) byTag[t] = (byTag[t] || 0) + a;
      }
    }

    // ── 商品別粗利（原価表に載っているものだけ原価が付く）──
    // メニュー表にあるのに期間中1つも売れなかった商品も、0個として載せる（売れていない商品を見落とさないため）
    // Squareの別名で売れていれば売れた商品なので載せない
    //
    // ただし「抹茶ワッフル」「ココアバナナプロテイン」のように、レジでは「ワッフル」「プロテインスムージー」の
    // 種類として売っているものは、別の商品として0個で並べない（種類ごとの内訳に出る）。2026-11-09 坂本さんの指摘
    const flavorParents = Object.entries(byVariant)
      .filter(([, vs]) => Object.keys(vs).filter((k) => k !== "種類が分からない").length >= 2)
      .map(([p]) => p);
    const isFlavorOf = (name: string) =>
      canonicalName(name).name !== name ||
      flavorParents.some((p) => name !== p && (name.includes(p) || name.includes(p.slice(0, 4))));
    const zero = (): ProductAgg => ({ qty: 0, amount: 0, cost: 0, months: {}, days: {} });
    const menuNames = new Set(menu.flatMap((m) => [m.name, ...(m.aliases ?? [])]));
    for (const m of menu) {
      const sold = [m.name, ...(m.aliases ?? [])].some((n) => byProduct[n]);
      if (m.price !== null && !sold && !isFlavorOf(m.name)) byProduct[m.name] = zero();
    }
    // Squareのメニューにあるのに売れていない商品も全部並べる（原価表に載っていないものも）。
    // 提供停止にした商品は、売れていなければ出さない
    const catalogCategory: Record<string, string> = {};
    // パーティ・イベント用の商品の名前（Squareの分類で決める）
    const partyNames = new Set<string>();
    // 商品名 → Squareの種類の名前。売れていない種類も内訳に0で出すのに使う
    const catalogVariations: Record<string, string[]> = {};
    try {
      const [catalog, hidden] = await Promise.all([listItems(), getHidden()]);
      const hiddenSet = new Set(hidden);
      for (const it of catalog) {
        catalogVariations[it.name] = it.variations.map((v) => v.name).filter((n) => n && n !== "Regular");
        if (PARTY_CATEGORY.has(it.category)) partyNames.add(it.name);
      }
      for (const it of catalog) {
        if (hiddenSet.has(it.id) || byProduct[it.name] || menuNames.has(it.name) || isFlavorOf(it.name)) continue;
        if (RETIRED_PRODUCT.test(it.name)) continue;
        byProduct[it.name] = zero();
        catalogCategory[it.name] = it.category || "その他";
      }
    } catch {
      /* Squareのメニューが読めなくても分析は出す */
    }
    const categoryByName: Record<string, string> = { ...catalogCategory };
    for (const m of menu) {
      categoryByName[m.name] = m.category;
      for (const alias of m.aliases ?? []) categoryByName[alias] = m.category;
    }
    for (const n of Object.keys(byProduct)) {
      if (partyNames.has(n) || PARTY_NAME.test(n)) delete byProduct[n];
    }
    const products = Object.entries(byProduct)
      .map(([name, v]) => ({
        name, qty: v.qty, amount: v.amount,
        cost: Math.round(v.cost),
        gross: v.amount - Math.round(v.cost),
        rate: v.amount ? Math.round((v.cost / v.amount) * 1000) / 10 : null,
        hasCost: costByName[name] !== undefined,
        category: categoryByName[name] || "その他",
        months: Object.entries(v.months)
          .sort()
          .map(([month, mv]) => ({ month, qty: mv.qty, amount: mv.amount, cost: Math.round(mv.cost) })),
        // [日, 数, 売上] の並び。量が多いので短い形で返す
        days: Object.entries(v.days)
          .sort()
          .map(([d, dv]) => [d, dv.qty, dv.amount] as [string, number, number]),
        noCost: NO_COST_PRODUCT.test(name),
      }))
      .sort((a, b) => b.amount - a.amount || b.qty - a.qty);

    // 種類が2つ以上ある商品だけ、種類ごとの内訳を返す。Squareにあって売れていない種類も0で足す
    for (const [parent, vs] of Object.entries(byVariant)) {
      for (const v of catalogVariations[parent] ?? []) {
        if (!vs[v]) vs[v] = { qty: 0, amount: 0, cost: 0, months: {}, days: {} };
      }
    }
    const variants = Object.entries(byVariant)
      .filter(([, vs]) => Object.keys(vs).filter((k) => k !== "種類が分からない").length >= 2)
      .flatMap(([parent, vs]) =>
        Object.entries(vs).map(([v, a]) => ({
          parent,
          variant: v,
          name: `${parent}（${v}）`,
          qty: a.qty,
          amount: a.amount,
          cost: Math.round(a.cost),
          category: categoryByName[parent] || "その他",
          months: Object.entries(a.months).sort().map(([month, mv]) => ({ month, qty: mv.qty, amount: mv.amount, cost: Math.round(mv.cost) })),
          days: Object.entries(a.days).sort().map(([d, dv]) => [d, dv.qty, dv.amount] as [string, number, number]),
        })),
      )
      .sort((a, b) => b.amount - a.amount);

    const knownCost = products.filter((p) => p.hasCost).reduce((s, p) => s + p.cost, 0);
    const knownSales = products.filter((p) => p.hasCost).reduce((s, p) => s + p.amount, 0);
    const unknownSales = totalSales - knownSales;

    return NextResponse.json({
      period: { from, to },
      // 分析から外した日。withEvents=1 を付けると混ぜて集計する
      excludedEvents: {
        applied: !withEvents,
        windows: EXCLUDE_WINDOWS,
        sales: Object.entries(eventSales).map(([label, v]) => ({ label, ...v })),
        total: Object.values(eventSales).reduce((n, v) => n + v.sales, 0),
      },
      sales: {
        total: totalSales,
        tax: totalTax,
        orderCount: orders.length,
        byDay: Object.entries(byDay).sort().map(([day, v]) => ({ day, ...v })),
        // 月別（1日あたりの平均も出す。月をまたいで比べるため）
        byMonth: Object.entries(byMonth)
          .sort()
          .map(([month, v]) => ({
            month,
            sales: v.sales,
            count: v.count,
            days: v.days.size,
            perDay: Math.round(v.sales / v.days.size),
          })),
        byTender: Object.entries(byTender)
          .map(([k, v]) => ({ tender: k, ...v }))
          .sort((a, b) => b.amount - a.amount),
        // 時間帯別（1日あたりの平均も出す。シフトを何時に置くかの判断用）
        byHour: Object.entries(byHour)
          .map(([h, v]) => ({
            hour: Number(h),
            sales: v.sales,
            count: v.count,
            days: v.days.size,
            avgSales: Math.round(v.sales / v.days.size),
            avgCount: Math.round((v.count / v.days.size) * 10) / 10,
          }))
          .sort((a, b) => a.hour - b.hour),
        byWeekday: Object.entries(byWeekday)
          .map(([w, v]) => ({
            weekday: Number(w),
            name: ["日", "月", "火", "水", "木", "金", "土"][Number(w)],
            sales: v.sales,
            count: v.count,
            days: v.days.size,
            avgSales: Math.round(v.sales / v.days.size),
          }))
          .sort((a, b) => a.weekday - b.weekday),
      },
      products,
      variants,
      productCostCoverage: {
        // 原価表と突き合わせできた売上の割合。低いとき粗利は当てにならない
        knownSales, unknownSales, knownCost,
        estGross: knownSales - knownCost,
      },
      expenses: {
        total: totalExpense,
        cogs,
        receiptCount: inRange.length,
        byCategory: Object.entries(byCategory)
          .map(([k, v]) => ({ category: k, amount: v }))
          .sort((a, b) => b.amount - a.amount),
        byTag: Object.entries(byTag)
          .map(([k, v]) => ({ tag: k, amount: v }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 15),
      },
      pnl: {
        sales: totalSales,
        // 商品原価は「原価表ベースの理論値」、仕入高は「実際に買った額」。
        // 開業期は仕入が先行するため両方を出す。
        theoreticalCogs: knownCost,
        actualPurchases: cogs,
        otherExpenses: totalExpense - cogs,
        grossByTheory: totalSales - knownCost,
        cashFlow: totalSales - totalExpense,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "集計に失敗" },
      { status: 500 },
    );
  }
}
