// Supabase の写しに書く。取り込み（sync.ts）だけが使う。
import { COMPANY_ID, db } from "./db";
import { chunk } from "./plan";
import type { MirrorState } from "./read";

type MirrorTable = "freee_wallet_txns" | "freee_deals" | "freee_manual_journals" | "freee_transfers";

function check(label: string, error: { message: string } | null) {
  if (error) throw new Error(`Supabase（${label}）への書き込みに失敗しました: ${error.message}`);
}

/**
 * 範囲の中身を freee から取った行で入れ替える。行は id で上書きし、
 * 範囲の中にあって今回来なかった行（freee で消された分）を消す。行の synced_at は syncedAt にそろえておくこと
 */
export async function replaceRange(
  table: MirrorTable,
  rows: object[],
  range: { column: "date" | "issue_date"; from: string; to: string },
  syncedAt: string,
): Promise<void> {
  for (const part of chunk(rows, 500)) {
    const { error } = await db().from(table).upsert(part, { onConflict: "company_id,id" });
    check(table, error);
  }
  const { error } = await db()
    .from(table)
    .delete()
    .eq("company_id", COMPANY_ID)
    .gte(range.column, range.from)
    .lte(range.column, range.to)
    .lt("synced_at", syncedAt);
  check(`${table} の古い行`, error);
}

export async function putMaster(kind: "walletables" | "account_items" | "partners", raw: unknown, syncedAt: string) {
  const { error } = await db()
    .from("freee_masters")
    .upsert({ company_id: COMPANY_ID, kind, raw, synced_at: syncedAt }, { onConflict: "company_id,kind" });
  check(kind, error);
}

export async function putReport(
  kind: "trial_pl" | "trial_bs_partner",
  period: string,
  raw: unknown,
  upToDate: boolean,
  syncedAt: string,
) {
  const { error } = await db()
    .from("freee_reports")
    .upsert(
      { company_id: COMPANY_ID, kind, period, raw, up_to_date: upToDate, synced_at: syncedAt },
      { onConflict: "company_id,kind,period" },
    );
  check(`${kind} ${period}`, error);
}

/** 渡した項目だけ書き換える */
export async function saveMirrorState(patch: Partial<MirrorState>) {
  const row: Record<string, unknown> = { company_id: COMPANY_ID };
  if ("lastSuccessAt" in patch) row.last_success_at = patch.lastSuccessAt;
  if ("lastError" in patch) row.last_error = patch.lastError;
  if ("lastErrorAt" in patch) row.last_error_at = patch.lastErrorAt;
  if ("alertedAt" in patch) row.alerted_at = patch.alertedAt;
  if ("lastNightlyDate" in patch) row.last_nightly_date = patch.lastNightlyDate;
  if ("monthHashes" in patch) row.month_hashes = patch.monthHashes;
  const { error } = await db().from("freee_sync_state").upsert(row, { onConflict: "company_id" });
  check("取り込みの状態", error);
}

export async function insertRun(run: {
  trigger: string;
  nightly: boolean;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  error: string | null;
  requests: number;
  counts: Record<string, number>;
}) {
  const { error } = await db().from("freee_sync_runs").insert({
    company_id: COMPANY_ID,
    trigger: run.trigger,
    nightly: run.nightly,
    started_at: run.startedAt,
    finished_at: run.finishedAt,
    ok: run.ok,
    error: run.error,
    requests: run.requests,
    counts: run.counts,
  });
  check("取り込みの記録", error);
}
