import { NextRequest, NextResponse } from "next/server";
import { passAuth } from "@/lib/internalFetch";
import { getSettings, saveSettings, type Settings } from "@/lib/seiseki";
import { paymentsIn } from "@/lib/loans";
import { getOverrides, splitByCategory } from "@/lib/salesCategory";
import { getUberOrders, isCompleted } from "@/lib/uber";
import { pickSource } from "@/lib/freeeMirror/source";
import { eventSalesFromDeals, type EventSale } from "@/lib/keiri/eventSales";

export const runtime = "nodejs";
export const maxDuration = 60;

const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

// GET /api/seiseki?month=2026-08
//   今月の売上（Square実績＋Uber Eats）と、前提値から出した利益の見込みを返す。
export async function GET(req: NextRequest) {
  try {
    const today = jstToday();
    const month = req.nextUrl.searchParams.get("month") || today.slice(0, 7);
    const from = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const to = `${month}-${String(lastDay).padStart(2, "0")}`;

    const settings = await getSettings();
    // イベント出店の売上は Square に入らないので、freee に手で記帳した分（科目は売上高、摘要に「イベント」）を足す。
    // freee の写しが読めなくても成績は出す（ok=false を画面に出す）
    const eventsP = (async () => {
      const src = await pickSource(req);
      const [deals, items] = await Promise.all([src.deals({ from, to }), src.accountItems()]);
      const salesId = items.find((i) => i.name === "売上高")?.id;
      return { ok: salesId !== undefined, list: salesId !== undefined ? eventSalesFromDeals(deals, salesId) : [] };
    })().catch(() => ({ ok: false, list: [] as EventSale[] }));
    const res = await fetch(
      `${req.nextUrl.origin}/api/analytics?from=${from}&to=${to}&withEvents=1`,
      { cache: "no-store", headers: passAuth(req) },
    );
    // イベントの日も実際の売上なので含める（withEvents=1）
    const a = await res.json();
    // Tシャツやステッカーが混ざるとカフェの実力が見えないので分けて出す
    const catOverrides = await getOverrides().catch(() => ({}));
    const split = splitByCategory(a?.products ?? [], catOverrides);

    // Uber Eats は Square に入らないので、取り込んだ注文（毎週月曜に取り込み）を足す。
    // 金額は商品の合計（手数料を引く前）。Squareの売上と同じく、売れた額で見る
    const uberOrders = Object.values(await getUberOrders().catch(() => ({})))
      .filter((o) => isCompleted(o) && o.date >= from && o.date <= to);
    const uber = {
      total: uberOrders.reduce((n, o) => n + o.subtotal, 0),
      count: uberOrders.length,
      lastDate: uberOrders.map((o) => o.date).sort().pop() ?? null,
    };
    split.カフェ.sales += uber.total;

    const ev = await eventsP;
    const events = { ok: ev.ok, total: ev.list.reduce((n, e) => n + e.amount, 0), list: ev.list };
    split.カフェ.sales += events.total;

    const byDayMap = new Map<string, { day: string; sales: number; count: number }>(
      ((a?.sales?.byDay ?? []) as { day: string; sales: number; count: number }[]).map((x) => [x.day, { ...x }]),
    );
    for (const o of uberOrders) {
      const d = byDayMap.get(o.date) ?? { day: o.date, sales: 0, count: 0 };
      d.sales += o.subtotal;
      d.count += 1;
      byDayMap.set(o.date, d);
    }
    for (const e of events.list) {
      const d = byDayMap.get(e.date) ?? { day: e.date, sales: 0, count: 0 };
      d.sales += e.amount;
      byDayMap.set(e.date, d);
    }
    const byDay = [...byDayMap.values()].sort((p, q) => (p.day < q.day ? -1 : 1));
    const squareSales: number = a?.sales?.total ?? 0;
    const sales = squareSales + uber.total + events.total;
    // 件数は注文の数。イベントは件数の記録が無いので数えない
    const orderCount = (a?.sales?.orderCount ?? 0) + uber.count;

    // 今月がまだ途中なら、残り日数と「あと1日いくら必要か」を出す
    const isThisMonth = month === today.slice(0, 7);
    const doneDays = isThisMonth ? Number(today.slice(8, 10)) : lastDay;
    const leftDays = Math.max(0, lastDay - doneDays);

    const target = settings.targets[month] ?? 0;
    const cogs = Math.round(sales * settings.costRate);
    const gross = sales - cogs;
    // 経費は日割り。月末に満額かかる想定で、途中の日は経過分だけ乗せる。
    const spentRate = doneDays / lastDay;
    const fixed = Math.round(settings.fixedCost * spentRate);
    const labor = Math.round(settings.laborCost * spentRate);
    const profit = gross - fixed - labor;

    // 月末まで今のペースで進んだらどうなるか。
    // イベントは一度きりの売上なので、ペースからは外してそのまま足す（ペースに混ぜると月末見込みが膨らむ）
    const avgPerDay = doneDays > 0 ? sales / doneDays : 0;
    const pace = doneDays > 0 ? (sales - events.total) / doneDays : 0;
    const forecastSales = Math.round(pace * lastDay) + events.total;
    const forecastProfit =
      Math.round(forecastSales * (1 - settings.costRate)) -
      settings.fixedCost -
      settings.laborCost;

    // 目標に届くには残りの日にいくら必要か
    const needPerDay = leftDays > 0 ? Math.max(0, Math.ceil((target - sales) / leftDays)) : 0;
    // 赤字にならないための最低ライン（月商）
    const breakEven = Math.round((settings.fixedCost + settings.laborCost) / (1 - settings.costRate));

    // 借入の返済。元金は費用にならないので利益からは引かないが、
    // 現金は出ていくので別枠で見せる。
    const loanPays = paymentsIn(month);
    const loan = {
      total: loanPays.reduce((s, p) => s + p.total, 0),
      principal: loanPays.reduce((s, p) => s + p.principal, 0),
      interest: loanPays.reduce((s, p) => s + p.interest, 0),
    };

    return NextResponse.json({
      month,
      today,
      loan,
      cashLeft: profit - loan.principal,
      split,
      settings,
      days: { total: lastDay, done: doneDays, left: leftDays },
      sales: { total: sales, orderCount, byDay, avgPerDay: Math.round(avgPerDay), square: squareSales, uber, events },
      target,
      achieveRate: target ? Math.round((sales / target) * 1000) / 10 : null,
      needPerDay,
      pnl: { sales, cogs, gross, fixed, labor, profit },
      forecast: { sales: forecastSales, profit: forecastProfit },
      breakEven,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/seiseki  { costRate?, fixedCost?, laborCost?, targets?, breakdown? }
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<Settings>;
    const saved = await saveSettings(body);
    return NextResponse.json({ ok: true, settings: saved });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}
