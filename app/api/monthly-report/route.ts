import { NextRequest, NextResponse } from "next/server";
import { isConnected } from "@/lib/freee";
import { passAuth } from "@/lib/internalFetch";
import { buildMonthly, saveSettings, setOverride, type Bucket, type Settings } from "@/lib/monthlyReport";

export const runtime = "nodejs";
export const maxDuration = 60;

const jstMonth = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);

// GET /api/monthly-report?month=2026-09
//   freeeの実績を「通常営業／イベント／臨時」に分けた月次レポートと、アルバイト試算の材料を返す
export async function GET(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続です" }, { status: 400 });
  }
  try {
    const month = req.nextUrl.searchParams.get("month") || jstMonth();
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const from = `${month}-01`;
    const to = `${month}-${String(last).padStart(2, "0")}`;

    // Squareの売上（イベント時間帯を外したもの）。イベント分の金額と、時間帯別の平均売上に使う
    const res = await fetch(`${req.nextUrl.origin}/api/analytics?from=${from}&to=${to}`, {
      headers: passAuth(req),
      cache: "no-store",
    });
    const a = res.ok ? await res.json() : null;
    const evSales: { label: string; sales: number; reason: string }[] = a?.excludedEvents?.sales ?? [];
    const data = await buildMonthly(
      month,
      evSales.filter((e) => e.reason === "イベント"),
    );

    const bizDays: number = (a?.sales?.byDay ?? []).length;
    const hourly = ((a?.sales?.byHour ?? []) as { hour: number; sales: number }[])
      .map((h) => ({ hour: h.hour, avgSales: bizDays ? Math.round(h.sales / bizDays) : 0 }))
      .sort((p, q) => ((p.hour + 18) % 24) - ((q.hour + 18) % 24)); // 6時始まりで並べる

    return NextResponse.json({ ...data, bizDays, hourly });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST { action: "override", key, bucket|null } … 1行の振り分けを変える（null で自動に戻す）
// POST { action: "settings", settings } … 時給・見込みの設定を変える
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: string;
      key?: string;
      bucket?: Bucket | null;
      settings?: Partial<Settings>;
    };
    if (body.action === "override" && body.key) {
      await setOverride(body.key, body.bucket ?? null);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "settings" && body.settings) {
      const s = await saveSettings(body.settings);
      return NextResponse.json({ ok: true, settings: s });
    }
    return NextResponse.json({ error: "action が不正です" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}
