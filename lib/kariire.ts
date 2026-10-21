// 立替（役員借入金）の人ごとの残りと返済予定を freee（写し）から出す。立替の画面と経理のお知らせで使う
import { pickSource } from "@/lib/freeeMirror/source";
import { jstMonth, periodOf } from "@/lib/keiri/period";
import { YAKUIN_KARIIRE_ID } from "@/lib/freeeMap";
import { advancesByPerson, repaymentPlan, type Advance, type Payment } from "@/lib/keiri/advances";

// 返済の決まり（2026-10-21 坂本さん）。毎月6日（役員報酬と同じ日）に3万円ずつ。
// 役員報酬と國仲さんの業務委託費を払ったあとも口座に30万円以上残る月は、前倒しで多めに返す（額はその都度決める）
export const REPAY_MONTHLY = 30000;
export const REPAY_DAY = 6;
export const PREPAY_THRESHOLD = 300000;

export type PersonAdvance = Advance & { plan: Payment[] };

/** freee の試算表から、人ごとの残りと返済予定。freee が読めなければ null */
export async function personAdvances(req?: { nextUrl: URL }): Promise<PersonAdvance[] | null> {
  try {
    const src = await pickSource(req);
    const bs = await src.trialBsPartner(periodOf(jstMonth()).fiscalYear);
    if (!bs) return null;
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    return advancesByPerson(bs.trial_bs.balances, YAKUIN_KARIIRE_ID).map((a) => ({
      ...a,
      plan: repaymentPlan(a.balance, { monthly: REPAY_MONTHLY, day: REPAY_DAY, today }),
    }));
  } catch {
    return null;
  }
}


/** 毎月6日に出ていく役員報酬3人分と國仲さんの業務委託費。前倒しできるかの見込みに使う */
export const PAYROLL_ON_PAYDAY = 62999 * 3 + 52056;
