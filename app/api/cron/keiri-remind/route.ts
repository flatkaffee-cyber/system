import { NextRequest, NextResponse } from "next/server";
import { getStaffLineIds, pushLine } from "@/lib/staffLine";
import { freeeGet, FREEE_COMPANY_ID } from "@/lib/freee";
import { pickSource } from "@/lib/freeeMirror/source";
import { getReceipts } from "@/lib/receipts";
import { personAdvances, PAYROLL_ON_PAYDAY, PREPAY_THRESHOLD, REPAY_DAY } from "@/lib/kariire";
import { nextPayday } from "@/lib/keiri/advances";
import { buildRemindMessage, type RemindInput } from "@/lib/keiri/remind";

export const runtime = "nodejs";
export const maxDuration = 120;

// 毎朝、経理で坂本さんにしかできないことを LINE で知らせる（2026-10-21 坂本さんの希望で毎日に）。
// 明細の消込やレシートとの突き合わせは、その前に Claude が毎朝片付ける（このパソコンの定期タスク）。
// ここに出すのは、レシートが無い支払い・freee に入っていない立替レシート・判断が要る明細・6日の返済。
// 頼むことが無い日は送らない。?force=1 で送らずに文面だけ返す（確かめ用）。
const TARGET = "坂本";
const BASE = "https://flat-keihi.vercel.app";
const BANK = 4808679; // GMOあおぞら 普通預金

export async function GET(req: NextRequest) {
  try {
    const dryRun = req.nextUrl.searchParams.get("force") === "1";
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const from = new Date(Date.now() + 9 * 3600_000 - 90 * 86400_000).toISOString().slice(0, 10);
    const src = await pickSource(req);

    const input: RemindInput = { today, base: BASE, unprocessed: [], noReceipt: [], unregisteredAdvances: [] };

    try {
      const txns = await src.walletTxns({ from: "2026-06-01", to: today }, { walletableTypes: ["bank_account"], status: 1 });
      input.unprocessed = txns.map((t) => ({ date: t.date, amount: t.amount, description: t.description }));
    } catch {
      /* freee が読めなくても他は知らせる */
    }

    try {
      const [deals, partners] = await Promise.all([src.deals({ from, to: today }), src.partners()]);
      const name = new Map(partners.map((p) => [p.id, p.name]));
      input.noReceipt = deals
        .filter((d) => d.details.some((l) => (l.description ?? "").includes("詳細未登録")))
        .map((d) => ({
          date: d.issue_date,
          amount: d.amount ?? d.details.reduce((s, l) => s + l.amount, 0),
          partner: (d.partner_id && name.get(d.partner_id)) || "（取引先なし）",
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      /* 同上 */
    }

    try {
      input.unregisteredAdvances = (await getReceipts())
        .filter((r) => (r.expenseKind ?? "company") === "company" && !r.registered && !/重複/.test(r.memo ?? ""))
        .map((r) => ({ date: r.date, amount: r.total, payer: r.payer || "不明", vendor: (r.vendor || "").slice(0, 12) }))
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      /* 同上 */
    }

    // 返済日の前の5日間だけ、次の返済と前倒しの見込みを出す
    const payday = nextPayday(today, REPAY_DAY);
    const daysTo = (Date.parse(payday) - Date.parse(today)) / 86400_000;
    if (daysTo <= 5) {
      const persons = await personAdvances(req);
      const items = (persons ?? [])
        .filter((p) => p.plan[0]?.date === payday)
        .map((p) => ({ person: p.person, amount: p.plan[0].amount }));
      let afterPayroll: number | null = null;
      try {
        const { walletables } = await freeeGet<{ walletables: { id: number; last_balance?: number }[] }>(
          "/api/1/walletables",
          { company_id: FREEE_COMPANY_ID, with_balance: "true" },
        );
        const bank = walletables.find((w) => w.id === BANK)?.last_balance;
        if (typeof bank === "number") afterPayroll = bank - PAYROLL_ON_PAYDAY;
      } catch {
        /* 残高が分からなければ見込みは出さない */
      }
      input.repay = { date: payday, items, afterPayroll, prepayThreshold: PREPAY_THRESHOLD };
    }

    const message = buildRemindMessage(input);
    if (!message) return NextResponse.json({ ok: true, sent: false, reason: "頼むことはありません" });
    if (dryRun) return NextResponse.json({ ok: true, sent: false, message });

    const id = (await getStaffLineIds())[TARGET];
    if (!id) {
      return NextResponse.json({
        ok: false,
        error: "坂本のLINEが未登録です（勤怠のLINE打刻を一度開くと登録されます）",
        message,
      });
    }
    await pushLine(id, message);
    return NextResponse.json({ ok: true, sent: true, message });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
