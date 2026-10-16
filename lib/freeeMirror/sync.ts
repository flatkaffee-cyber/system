// freee → Supabase の取り込み1回分。毎分の cron（cronTick）と、経理画面の「今すぐ取り込む」から呼ばれる。
// cron は、システムから freee に書き込んだ印（lib/freee.ts の markDirty）があるか、前回から5分たったときだけ取り込む。
// freee から全部取り切ってから書く。取る途中で1つでも失敗したら何も書かない（前の数字のまま）。
// 書く直前に鍵がまだ自分のものか確かめ、期限切れでほかの取り込みが動いていたら書かずにやめる。
import { fiscalMonths, fiscalRange, jstDate, jstHour, jstMonth, periodOf, syncRange } from "@/lib/keiri/period";
import { getStaffLineIds, pushLine } from "@/lib/staffLine";
import { COMPANY_ID, isDbReady } from "./db";
import { alertMessage, shouldAlert } from "./health";
import { makeLiveSource } from "./live";
import { stillMine, SYNC_DIRTY, SYNC_LOCK, tryLock, unlock, type LockKv } from "./lock";
import { mapLimit, monthHashes, needsNightly, shouldRunCron, trialPlMonthsToRefresh } from "./plan";
import { getMirrorState, trialPlStatus, type MirrorState } from "./read";
import { dealRow, journalRow, transferRow, walletTxnRow } from "./rows";
import type { TrialPlResponse } from "./source";
import { insertRun, putMaster, putReport, replaceRange, saveMirrorState } from "./write";

export type SyncTrigger = "cron" | "manual" | "after-write";
export type SyncResult = {
  ran: boolean;
  busy?: boolean;
  skipped?: boolean;
  ok?: boolean;
  error?: string;
  requests?: number;
  nightly?: boolean;
};

// 鍵は取り込みのルートの時間制限（maxDuration 300秒）より長く持つ。打ち切られても330秒で自然に外れる
const LOCK_SEC = 330;
const DIRTY_SEC = 3600;
const ALERT_TO = "坂本"; // 経理を触るのが坂本のため（keiri-remind と同じ）
const BASE = "https://flat-keihi.vercel.app";

async function kv(): Promise<LockKv | null> {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

/** システムから freee に書き込んだ印を付ける（lib/freee.ts が書き込みのたびに呼ぶ）。取り込みは毎分の cron が行う */
export async function markDirty(): Promise<void> {
  const store = await kv();
  if (store) await store.set(SYNC_DIRTY, "1", { ex: DIRTY_SEC });
}

/** 毎分の cron。書き込みの印があるか、前回から5分たったときだけ取り込む */
export async function cronTick(): Promise<SyncResult> {
  const store = await kv();
  if (!store || !isDbReady()) return { ran: false, error: "Supabase未設定" };
  const [dirty, state] = await Promise.all([store.get(SYNC_DIRTY), getMirrorState()]);
  if (!shouldRunCron({ dirty: !!dirty, lastSuccessAt: state.lastSuccessAt, lastErrorAt: state.lastErrorAt, nowMs: Date.now() })) {
    return { ran: false, skipped: true };
  }
  return syncFreee("cron");
}

export async function syncFreee(trigger: SyncTrigger): Promise<SyncResult> {
  const store = await kv();
  if (!store || !isDbReady()) return { ran: false, error: "Supabase未設定" };
  const token = await tryLock(store, SYNC_LOCK, LOCK_SEC);
  // ほかの取り込みが動いている。その間の書き込みは印が残るので、次の cron が拾う
  if (!token) return { ran: false, busy: true };
  try {
    // 取る前に印を消す。取っている間に書き込まれた分は、また印が付いて次の cron が拾う
    await store.del(SYNC_DIRTY);
    return await runOnce(trigger, store, token);
  } finally {
    await unlock(store, SYNC_LOCK, token);
  }
}

async function runOnce(trigger: SyncTrigger, store: LockKv, token: string): Promise<SyncResult> {
  const started = new Date();
  const syncedAt = started.toISOString();
  const nowMs = started.getTime();
  let requests = 0;
  let nightly = false;
  let state: MirrorState | null = null;
  let alerted = false;
  try {
    state = await getMirrorState();
    // 時間切れで打ち切られた回は記録が残らないので、始まりの時点でも「60分成功していない」を確かめる
    if (shouldAlert(state, nowMs) && (await alert(state))) {
      alerted = true;
      await saveMirrorState({ alertedAt: syncedAt });
    }
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
      // 今期は期首の3か月前から（期の変わり目の前期分も毎回拾う）。前期は毎晩まるごと
      const range = y === fy ? syncRange(y) : fiscalRange(y);
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
    if (prevBs) months.unshift(...fiscalMonths(fy - 1, fiscalRange(fy - 1).to.slice(0, 7)));
    // 試算表は1か月ずつ聞くので、3本ずつ並べて取る
    const got = await mapLimit(months, 3, (m) => src.trialPl(m));
    const pls = months.flatMap((m, i): [string, TrialPlResponse][] => (got[i] ? [[m, got[i]!]] : []));

    if (!(await stillMine(store, SYNC_LOCK, token))) {
      throw new Error("取り込みに時間がかかりすぎて鍵の期限が切れたので、書き込みをやめました");
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
      if (!alerted && shouldAlert(failed, nowMs) && (await alert(failed))) await saveMirrorState({ alertedAt: syncedAt });
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
  await pushLine(id, alertMessage(s, BASE));
  return true;
}
