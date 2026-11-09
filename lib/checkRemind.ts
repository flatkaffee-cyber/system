// 業務チェックの声かけ。決まった時刻に、その区分（朝・営業中・夜前・締め）の
// チェックが残っていたら、その時間にシフトに入っている人へLINEで知らせる。
//
// 2026-11-09 坂本さんと決めたこと
//   ・朝 10:30 ／ 営業中 16:30 ／ 夜前 18:30 ／ 締め 閉店（24:30）の30分後＝翌1:00
//   ・送るのはシフトの本人だけ（坂本さんへの写しは無し）
//   ・LINEの無料枠は月200通。グループに送っても人数分数えるので、個別に送る。
//     イベント告知（友だち全員＝1回で20通以上）の分を残すため、残りが少ないときは送らない

import type { Phase } from "@/lib/opening";
import { toMin, type ShiftEntry } from "@/lib/shift";

export type RemindPhase = Exclude<Phase, "週次">;

/** 確認する時刻（日本時間、その営業日の0時からの分）。締めは24時を超えるので翌日の1:00 */
export const CHECK_TIMES: Record<RemindPhase, number> = {
  朝: 10 * 60 + 30,
  営業中: 16 * 60 + 30,
  夜前: 18 * 60 + 30,
  締め: 25 * 60,
};

/** この通数より残りが少なければ送らない（イベント告知1回分を残す） */
export const QUOTA_RESERVE = 30;

const pad = (n: number) => String(n).padStart(2, "0");
export const hhmm = (min: number) => `${Math.floor(min / 60) % 24}:${pad(min % 60)}`;

/** JSTのいまの時刻から、確認する区分と営業日を決める。cronの遅れを見込んで、その時の中なら当てはめる */
export function phaseNow(now = new Date()): { phase: RemindPhase; date: string } | null {
  const jst = new Date(now.getTime() + 9 * 3600_000);
  const h = jst.getUTCHours();
  const late = jst.getUTCMinutes() >= 30;
  const today = jst.toISOString().slice(0, 10);
  // cronは毎時0分と30分に呼ばれる（vercel.json）。30分の回だけ当てはめる。締めは1:00の回
  if (h === 10 && late) return { phase: "朝", date: today };
  if (h === 16 && late) return { phase: "営業中", date: today };
  if (h === 18 && late) return { phase: "夜前", date: today };
  if (h === 1 && !late) {
    // 深夜1時は前の営業日の締め
    const y = new Date(jst.getTime() - 86_400_000).toISOString().slice(0, 10);
    return { phase: "締め", date: y };
  }
  return null;
}

/**
 * その時刻にシフトに入っている人。確認する時刻の1分前で見る
 * （16:30で上がる人も、16:30から入る人も「その時間の人」に入れる）
 */
export function staffOnShift(shifts: ShiftEntry[], date: string, phase: RemindPhase): string[] {
  const at = CHECK_TIMES[phase] - 1;
  // 締めは閉店の時間（24:30）の1分前に入っていた人
  const t = phase === "締め" ? 24 * 60 + 29 : at;
  const names = shifts
    .filter((s) => s.date === date)
    .filter((s) => {
      const a = toMin(s.start);
      const b = toMin(s.end);
      return a != null && b != null && a <= t && t < b;
    })
    .map((s) => s.staff);
  return [...new Set(names)];
}

export function remindText(phase: RemindPhase, date: string, left: string[]): string {
  const md = `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  return [
    `【業務チェック】${md} ${phase}のチェックが${left.length}件残っています（${hhmm(CHECK_TIMES[phase])}時点）`,
    ...left.map((n) => `・${n}`),
    "",
    "終わっていたら、業務チェックで✓を付けてください",
    "https://flat-keihi.vercel.app/opening",
  ].join("\n");
}

/* ── 同じ区分を二度送らないための記録 ───────────── */

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

const sentKey = (date: string, phase: RemindPhase) => `checkremind:${date}:${phase}`;

export async function alreadySent(date: string, phase: RemindPhase): Promise<boolean> {
  const store = await kv();
  if (!store) return false;
  return !!(await store.get(sentKey(date, phase)));
}

export async function markSent(date: string, phase: RemindPhase, detail: unknown): Promise<void> {
  const store = await kv();
  if (!store) return;
  // 記録は2週間で消える
  await store.set(sentKey(date, phase), detail, { ex: 14 * 86_400 });
}

/** 今月あと何通送れるか。読めないときは null（そのときは送る） */
export async function lineQuotaLeft(): Promise<number | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
  if (!token) return null;
  try {
    const get = async (p: string) => {
      const r = await fetch(`https://api.line.me/v2/bot${p}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      return r.ok ? r.json() : null;
    };
    const [q, c] = await Promise.all([get("/message/quota"), get("/message/quota/consumption")]);
    if (q?.type !== "limited" || typeof q.value !== "number" || typeof c?.totalUsage !== "number") return null;
    return q.value - c.totalUsage;
  } catch {
    return null;
  }
}
