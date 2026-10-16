// freee → Supabase の取り込み1回分。5分おきの cron、経理画面の「今すぐ取り込む」、
// システムから freee に書き込んだあと（lib/freee.ts）に呼ばれる。
// freee から全部取り切ってから書く。取る途中で1つでも失敗したら何も書かない（前の数字のまま）。
import { fiscalMonths, fiscalRange, jstDate, jstHour, jstMonth, periodOf } from "@/lib/keiri/period";
import { getStaffLineIds, pushLine } from "@/lib/staffLine";
import { COMPANY_ID, isDbReady } from "./db";
import { shouldAlert, stamp } from "./health";
import { makeLiveSource } from "./live";
import { SYNC_AGAIN, SYNC_LOCK, tryLock, unlock, type LockKv } from "./lock";
import { monthHashes, needsNightly, trialPlMonthsToRefresh } from "./plan";
import { getMirrorState, trialPlStatus, type MirrorState } from "./read";
import { dealRow, journalRow, transferRow, walletTxnRow } from "./rows";
import type { TrialPlResponse } from "./source";
import { insertRun, putMaster, putReport, replaceRange, saveMirrorState } from "./write";

export type SyncTrigger = "cron" | "manual" | "after-write";
export type SyncResult = { ran: boolean; busy?: boolean; ok?: boolean; error?: string; requests?: number; nightly?: boolean };

const LOCK_SEC = 120;
const AGAIN_SEC = 300;
const ALERT_TO = "坂本"; // 経理を触るのが坂本のため（keiri-remind と同じ）
const BASE = "https://flat-keihi.vercel.app";

async function kv(): Promise<LockKv | null> {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export async function syncFreee(trigger: SyncTrigger): Promise<SyncResult> {
  const store = await kv();
  if (!store || !isDbReady()) return { ran: false, error: "Supabase未設定" };
  const token = await tryLock(store, SYNC_LOCK, LOCK_SEC);
  if (!token) {
    // 動いている取り込みが終わったら、もう1回だけ回してもらう（その間に書き込まれた分を拾うため）
    await store.set(SYNC_AGAIN, "1", { ex: AGAIN_SEC });
    return { ran: false, busy: true };
  }
  try {
    let result = await runOnce(trigger);
    if ((await store.del(SYNC_AGAIN)) > 0) result = await runOnce(trigger);
    return result;
  } finally {
    await unlock(store, SYNC_LOCK, token);
  }
}

async function runOnce(trigger: SyncTrigger): Promise<SyncResult> {
  const started = new Date();
  const syncedAt = started.toISOString();
  const nowMs = started.getTime();
  let requests = 0;
  let nightly = false;
  let state: MirrorState | null = null;
  try {
    state = await getMirrorState();
    const today = jstDate(nowMs);
    const thisMonth = jstMonth(nowMs);
    const fy = periodOf(thisMonth).fiscalYear;
    nightly = needsNightly(state.lastNightlyDate, today, jstHour(nowMs));
    const src = makeLiveSource({ onRequest: () => requests++ });

    // 1. freee から取り切る
    const [walletables, accountItems, partners] = await Promise.all([src.walletables(), src.accountItems(), src.partners()]);
    const years = [fy];
    // 毎晩は前期も（決算の修正を拾うため）。前期が freee に無ければ（1期目）飛ばす
    const prevBs = nightly ? await src.trialBsPartner(fy - 1) : null;
    if (prevBs) years.unshift(fy - 1);
    const perYear = [];
    for (const y of years) {
      const range = fiscalRange(y);
      const [txns, deals, journals, transfers, bs] = await Promise.all([
        src.walletTxns(range),
        src.deals(range),
        src.manualJournals(range),
        src.transfers(range),
        y === fy ? src.trialBsPartner(y) : Promise.resolve(prevBs),
      ]);
      perYear.push({ y, range, txns, deals, journals, transfers, bs });
    }
    const cur = perYear[perYear.length - 1];
    const nextHashes = monthHashes({ deals: cur.deals, journals: cur.journals, transfers: cur.transfers });
    const { stored, notUpToDate } = await trialPlStatus(fy);
    const months = trialPlMonthsToRefresh({
      fyMonths: fiscalMonths(fy, thisMonth),
      thisMonth,
      prevHashes: state.monthHashes,
      nextHashes,
      storedMonths: stored,
      notUpToDate,
      nightly,
    });
    if (prevBs) months.unshift(...fiscalMonths(fy - 1, `${fy}-05`));
    const pls: [string, TrialPlResponse][] = [];
    for (const m of months) {
      const r = await src.trialPl(m);
      if (r) pls.push([m, r]);
    }

    // 2. ここで初めて書く
    const counts: Record<string, number> = { wallet_txns: 0, deals: 0, manual_journals: 0, transfers: 0, trial_pl: pls.length };
    for (const p of perYear) {
      await replaceRange("freee_wallet_txns", p.txns.map((t) => walletTxnRow(t, COMPANY_ID, syncedAt)), { column: "date", ...p.range }, syncedAt);
      await replaceRange("freee_deals", p.deals.map((d) => dealRow(d, COMPANY_ID, syncedAt)), { column: "issue_date", ...p.range }, syncedAt);
      await replaceRange("freee_manual_journals", p.journals.map((j) => journalRow(j, COMPANY_ID, syncedAt)), { column: "issue_date", ...p.range }, syncedAt);
      await replaceRange("freee_transfers", p.transfers.map((t) => transferRow(t, COMPANY_ID, syncedAt)), { column: "date", ...p.range }, syncedAt);
      if (p.bs) await putReport("trial_bs_partner", `fy${p.y}`, p.bs, p.bs.up_to_date, syncedAt);
      counts.wallet_txns += p.txns.length;
      counts.deals += p.deals.length;
      counts.manual_journals += p.journals.length;
      counts.transfers += p.transfers.length;
    }
    await putMaster("walletables", walletables, syncedAt);
    await putMaster("account_items", accountItems, syncedAt);
    await putMaster("partners", partners, syncedAt);
    for (const [m, r] of pls) await putReport("trial_pl", m, r, r.up_to_date, syncedAt);

    await saveMirrorState({
      lastSuccessAt: syncedAt,
      lastError: null,
      lastErrorAt: null,
      alertedAt: null,
      monthHashes: nextHashes,
      lastNightlyDate: nightly ? today : state.lastNightlyDate,
    });
    await insertRun({ trigger, nightly, startedAt: syncedAt, finishedAt: new Date().toISOString(), ok: true, error: null, requests, counts });
    return { ran: true, ok: true, requests, nightly };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await saveMirrorState({ lastError: msg, lastErrorAt: syncedAt });
      const failed = { ...(state ?? (await getMirrorState())), lastError: msg, lastErrorAt: syncedAt };
      if (shouldAlert(failed, nowMs) && (await alert(failed))) await saveMirrorState({ alertedAt: syncedAt });
      await insertRun({ trigger, nightly, startedAt: syncedAt, finishedAt: new Date().toISOString(), ok: false, error: msg, requests, counts: {} });
    } catch {
      // Supabase にも書けないときは、呼び出し元への応答に出すだけ
    }
    return { ran: true, ok: false, error: msg, requests, nightly };
  }
}

/** 取り込めない状態が続いていることを坂本さんに LINE で知らせる。送れたら true */
async function alert(s: MirrorState): Promise<boolean> {
  const id = (await getStaffLineIds())[ALERT_TO];
  if (!id) return false;
  await pushLine(
    id,
    [
      `【flat. 経理】freee から取り込めていません（最終 ${s.lastSuccessAt ? stamp(s.lastSuccessAt) : "なし"}）`,
      (s.lastError ?? "").slice(0, 80),
      `再接続: ${BASE}/api/freee/authorize`,
    ].join("\n"),
  );
  return true;
}
