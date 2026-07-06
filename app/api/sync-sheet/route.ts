import { NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, isConnected } from "@/lib/freee";
import { isGoogleConnected, sheetsClear, sheetsUpdate } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 60;

const SHEET_ID =
  process.env.MASTER_SHEET_ID || "1pSVbxI595eUYrvgeGBLNcT6S74K5pbJniiBgKnfBiBE";
const TAB = "freee実績";
const COMPANY = FREEE_COMPANY_ID;
// 会計期間
const START = "2026-06-01";
const END = "2027-05-31";

type Detail = {
  account_item_id: number;
  item_id?: number | null;
  amount: number;
};
type Deal = { id: number; issue_date: string; details: Detail[] };
type Journal = { id: number; issue_date: string; details: Detail[] };

export async function POST() {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続です" }, { status: 400 });
  }
  if (!(await isGoogleConnected())) {
    return NextResponse.json({ error: "Google未接続です" }, { status: 400 });
  }

  try {
    // 科目・品目のID→名称マップ
    const accRes = await freeeGet<{ account_items: { id: number; name: string }[] }>(
      "/api/1/account_items",
      { company_id: COMPANY },
    );
    const accMap = new Map(accRes.account_items.map((a) => [a.id, a.name]));
    const itemRes = await freeeGet<{ items: { id: number; name: string }[] }>("/api/1/items", {
      company_id: COMPANY,
      limit: "100",
    });
    const itemMap = new Map(itemRes.items.map((i) => [i.id, i.name]));

    // 取引＋振替伝票を取得
    const dealsRes = await freeeGet<{ deals: Deal[] }>("/api/1/deals", {
      company_id: COMPANY,
      start_date: START,
      end_date: END,
      limit: "100",
    });
    const mjRes = await freeeGet<{ manual_journals: Journal[] }>("/api/1/manual_journals", {
      company_id: COMPANY,
      start_date: START,
      end_date: END,
      limit: "100",
    });

    // 行に展開: [日付, 年月, 勘定科目, 品目, 金額, 取引ID]
    const rows: (string | number)[][] = [];
    const push = (id: number, date: string, d: Detail) => {
      const ym = date ? date.slice(0, 7) : "";
      rows.push([
        date,
        ym,
        accMap.get(d.account_item_id) ?? String(d.account_item_id),
        d.item_id ? (itemMap.get(d.item_id) ?? "") : "",
        d.amount,
        id,
      ]);
    };
    for (const dl of dealsRes.deals ?? []) for (const d of dl.details ?? []) push(dl.id, dl.issue_date, d);
    for (const mj of mjRes.manual_journals ?? []) for (const d of mj.details ?? []) push(mj.id, mj.issue_date, d);

    rows.sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1));

    // 既存データをクリアして最新を全書き（重複防止）
    await sheetsClear(SHEET_ID, `${TAB}!A2:F1000`);
    if (rows.length > 0) {
      await sheetsUpdate(SHEET_ID, `${TAB}!A2`, rows);
    }

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "同期に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
