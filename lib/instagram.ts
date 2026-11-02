// インスタの定期ストーリー。決まり・画像・接続の保存と、Instagram APIの呼び出し。
//
// 2026-11-03 営業日の10時・19時のオープンのストーリーを上げ忘れることがあるので作った。
// ランニングなど、毎週決まって上げるものも同じ仕組みで足せる。
//
// - 「いつ何を出すか」の計算は lib/instagramPlan.ts
// - 5分おきの cron（/api/cron/instagram）が runDue() を呼ぶ
// - 時刻の前に手で上げていれば出さない（決まりごとに切り替えられる）
//
// APIからはスタンプ（リンク・メンション・場所・音楽）を付けられない。画像だけ上げる。
// 画像はJPEGしか受け付けないので、画面側でJPEGに直してから送ってくる。

import { delFile, getFile, putFile } from "@/lib/fileStore";
import { SHOP } from "@/lib/shop";
import {
  dueSlots,
  jstNow,
  postedManually,
  runKey,
  type StoryRule,
} from "@/lib/instagramPlan";

const KEY_RULES = "ig:rules";
const KEY_CONN = "ig:conn";
const KEY_CLOSURES = "ig:closures";
const KEY_IMAGES = "ig:images";
const KEY_RUNS = "ig:runs";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

async function must() {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  return store;
}

// ───────── 決まり ─────────

export async function listRules(): Promise<StoryRule[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<StoryRule[]>(KEY_RULES)) ?? [];
}

export async function saveRule(rule: StoryRule): Promise<void> {
  const list = await listRules();
  const i = list.findIndex((r) => r.id === rule.id);
  if (i >= 0) list[i] = rule;
  else list.push(rule);
  await (await must()).set(KEY_RULES, list);
}

export async function removeRule(id: string): Promise<void> {
  const list = await listRules();
  await (await must()).set(KEY_RULES, list.filter((r) => r.id !== id));
}

// ───────── 臨時休業 ─────────

export async function listClosures(): Promise<string[]> {
  const store = await kv();
  if (!store) return [];
  return ((await store.get<string[]>(KEY_CLOSURES)) ?? []).sort();
}

export async function saveClosures(dates: string[]): Promise<void> {
  // 過ぎた日は要らないので、60日より前は落とす
  const cut = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  const clean = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= cut))].sort();
  await (await must()).set(KEY_CLOSURES, clean);
}

// ───────── 画像 ─────────

export type StoryImage = { id: string; name: string; createdAt: string };

export async function listImages(): Promise<StoryImage[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<StoryImage[]>(KEY_IMAGES)) ?? [];
}

/** 画像のIDはURLにそのまま出る（インスタが取りに来る）ので、推測できない長さにする */
function newImageId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function addImage(name: string, dataUrl: string): Promise<StoryImage> {
  if (!/^data:image\/jpeg;base64,/.test(dataUrl)) throw new Error("JPEGで送ってください");
  const img: StoryImage = { id: newImageId(), name: name.slice(0, 60), createdAt: new Date().toISOString() };
  if (!(await putFile(`ig:img:${img.id}`, dataUrl))) throw new Error("画像を保存できませんでした");
  const list = await listImages();
  list.push(img);
  await (await must()).set(KEY_IMAGES, list);
  return img;
}

export async function removeImage(id: string): Promise<void> {
  const used = (await listRules()).some((r) => r.slots.some((s) => s.imageIds.includes(id)));
  if (used) throw new Error("決まりで使っている画像です。先に決まりから外してください");
  await delFile(`ig:img:${id}`);
  const list = await listImages();
  await (await must()).set(KEY_IMAGES, list.filter((i) => i.id !== id));
}

export async function readImage(id: string): Promise<Buffer | null> {
  if (!/^[0-9a-f]{32}$/.test(id)) return null;
  const dataUrl = await getFile(`ig:img:${id}`);
  const m = dataUrl && /^data:[^;]+;base64,(.+)$/s.exec(dataUrl);
  return m ? Buffer.from(m[1], "base64") : null;
}

/** インスタが画像を取りに来るURL。本番のドメインで作る（プレビューのURLは保護がかかって開けない） */
export function imageUrl(id: string, origin?: string): string {
  const base =
    process.env.IG_PUBLIC_BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : origin);
  return `${base}/api/instagram/img/${id}.jpg`;
}

// ───────── 接続 ─────────

/**
 * 2通りの接続を受け付ける。トークンの頭で見分ける。
 * - IG… インスタでログインして作ったトークン（graph.instagram.com）。60日で切れるので週1で延ばす
 * - EAA… Facebookページ経由のトークン（graph.facebook.com）。インスタのアカウントIDも要る
 */
export type Conn = {
  token: string;
  userId: string;
  username: string;
  host: "graph.instagram.com" | "graph.facebook.com";
  savedAt: string;
  refreshedAt?: string;
  /** 最後にAPIが失敗したときの理由。画面に出す */
  lastError?: string;
};

const API_VERSION = process.env.IG_API_VERSION || "";

function api(conn: Pick<Conn, "host">, path: string): string {
  return `https://${conn.host}${API_VERSION ? `/${API_VERSION}` : ""}/${path.replace(/^\//, "")}`;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || body.error) {
    throw new Error(body.error?.message || `Instagram API ${res.status}`);
  }
  return body;
}

export async function getConn(): Promise<Conn | null> {
  const store = await kv();
  if (!store) return null;
  return (await store.get<Conn>(KEY_CONN)) ?? null;
}

async function putConn(conn: Conn): Promise<void> {
  await (await must()).set(KEY_CONN, conn);
}

export async function connect(token: string, userIdInput?: string): Promise<Conn> {
  const t = token.trim();
  const host: Conn["host"] = t.startsWith("EAA") ? "graph.facebook.com" : "graph.instagram.com";
  let userId = (userIdInput || "").trim();
  let username = "";
  if (host === "graph.instagram.com") {
    const me = await call<{ user_id?: string; id: string; username?: string }>(
      `${api({ host }, "me")}?fields=user_id,username&access_token=${encodeURIComponent(t)}`,
    );
    userId = userId || me.user_id || me.id;
    username = me.username || "";
  } else {
    if (!userId) throw new Error("Facebook経由のトークンのときは、インスタのアカウントIDも入れてください");
    const me = await call<{ username?: string }>(
      `${api({ host }, userId)}?fields=username&access_token=${encodeURIComponent(t)}`,
    );
    username = me.username || "";
  }
  const conn: Conn = { token: t, userId, username, host, savedAt: new Date().toISOString() };
  await putConn(conn);
  return conn;
}

export async function disconnect(): Promise<void> {
  await (await must()).del(KEY_CONN);
}

/** インスタでログインしたトークンは60日で切れる。最後に延ばしてから7日たっていたら延ばす */
async function refreshIfOld(conn: Conn): Promise<Conn> {
  if (conn.host !== "graph.instagram.com") return conn;
  const last = Date.parse(conn.refreshedAt || conn.savedAt);
  if (Date.now() - last < 7 * 86400_000) return conn;
  try {
    const r = await call<{ access_token: string }>(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(conn.token)}`,
    );
    const next = { ...conn, token: r.access_token, refreshedAt: new Date().toISOString(), lastError: undefined };
    await putConn(next);
    return next;
  } catch (e) {
    const next = { ...conn, lastError: `トークンの延長に失敗: ${e instanceof Error ? e.message : e}` };
    await putConn(next);
    return next;
  }
}

/** いま出ているストーリー（24時間以内）。取れなければ null */
export async function listStories(conn: Conn): Promise<{ id: string; timestamp: string }[] | null> {
  try {
    const r = await call<{ data: { id: string; timestamp?: string }[] }>(
      `${api(conn, `${conn.userId}/stories`)}?fields=id,timestamp&limit=50&access_token=${encodeURIComponent(conn.token)}`,
    );
    return r.data.map((s) => ({ id: s.id, timestamp: s.timestamp || "" }));
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 画像1枚をストーリーに上げて、できた投稿のIDを返す */
export async function postStory(conn: Conn, url: string): Promise<string> {
  const token = encodeURIComponent(conn.token);
  const container = await call<{ id: string }>(
    `${api(conn, `${conn.userId}/media`)}?media_type=STORIES&image_url=${encodeURIComponent(url)}&access_token=${token}`,
    { method: "POST" },
  );
  // 画像はふつうすぐ準備できるが、念のため最大30秒待つ
  for (let i = 0; i < 10; i++) {
    const s = await call<{ status_code?: string }>(
      `${api(conn, container.id)}?fields=status_code&access_token=${token}`,
    );
    if (s.status_code === "FINISHED" || !s.status_code) break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
      throw new Error(`画像の準備に失敗しました（${s.status_code}）`);
    }
    await sleep(3000);
  }
  const pub = await call<{ id: string }>(
    `${api(conn, `${conn.userId}/media_publish`)}?creation_id=${container.id}&access_token=${token}`,
    { method: "POST" },
  );
  return pub.id;
}

// ───────── 実行の記録 ─────────

export type RunRecord = {
  key: string;
  ruleId: string;
  ruleName: string;
  date: string;
  time: string;
  /** posted=自動で上げた / skipped=手で上げてあったので出さなかった / test=画面から試しに上げた */
  status: "posted" | "skipped" | "error" | "test";
  at: string;
  detail?: string;
  mediaIds?: string[];
};

export async function listRuns(): Promise<RunRecord[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<RunRecord[]>(KEY_RUNS)) ?? [];
}

async function addRun(r: RunRecord): Promise<void> {
  const list = await listRuns();
  list.push(r);
  await (await must()).set(KEY_RUNS, list.slice(-200));
}

// ───────── cron から ─────────

export async function runDue(origin?: string, now = Date.now()) {
  const conn0 = await getConn();
  if (!conn0) return { ok: true, note: "インスタ未接続" };
  const conn = await refreshIfOld(conn0);

  const today = jstNow(now);
  const [rules, closures, runs] = await Promise.all([listRules(), listClosures(), listRuns()]);
  // 失敗したものは記録があっても、もう一度試す（30分の枠の中で）
  const done = new Set(runs.filter((r) => r.status !== "error" && r.status !== "test").map((r) => r.key));
  const due = dueSlots(rules, today, SHOP.closedWeekday, closures, done);
  if (due.length === 0) return { ok: true, due: 0 };

  // 自動で上げたものは「手で上げた」に数えない。画面から試したものは数える
  const ownIds = new Set(runs.filter((r) => r.status === "posted").flatMap((r) => r.mediaIds ?? []));
  let stories: { id: string; timestamp: string }[] | null | undefined;
  const store = await must();
  const results: RunRecord[] = [];

  for (const d of due) {
    const key = runKey(d.rule.id, today.date, d.time);
    // 同じ枠を2つのcronが同時に拾っても、1回だけ上げる
    const locked = await store.set(`ig:lock:${key}`, 1, { nx: true, ex: 3600 });
    if (!locked) continue;
    const base = { key, ruleId: d.rule.id, ruleName: d.rule.name, date: today.date, time: d.time };

    let note: string | undefined;
    if (d.rule.skipIfPosted) {
      if (stories === undefined) stories = await listStories(conn);
      if (stories === null) {
        // 確かめられないときは上げる。上げ忘れの方が困るので
        note = "手で上げたかを確かめられなかったので、そのまま上げた";
      } else if (postedManually(stories, ownIds, today.date, d.time, d.rule.skipWindowMin)) {
        const r: RunRecord = { ...base, status: "skipped", at: new Date().toISOString(), detail: "手で上げてあった" };
        await addRun(r);
        results.push(r);
        continue;
      }
    }

    try {
      const mediaIds: string[] = [];
      for (const id of d.imageIds) mediaIds.push(await postStory(conn, imageUrl(id, origin)));
      mediaIds.forEach((m) => ownIds.add(m));
      const r: RunRecord = { ...base, status: "posted", at: new Date().toISOString(), mediaIds, detail: note };
      await addRun(r);
      results.push(r);
      if (conn.lastError) await putConn({ ...conn, lastError: undefined });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const r: RunRecord = { ...base, status: "error", at: new Date().toISOString(), detail: msg };
      await addRun(r);
      results.push(r);
      await store.del(`ig:lock:${key}`);
      await putConn({ ...conn, lastError: msg });
    }
  }
  return { ok: true, due: due.length, results };
}

/** 画面の「いま試しに上げる」。予定とは関係なく、その時刻の画像を上げる */
export async function postNow(ruleId: string, time: string, origin?: string): Promise<RunRecord> {
  const conn = await getConn();
  if (!conn) throw new Error("インスタが未接続です");
  const rule = (await listRules()).find((r) => r.id === ruleId);
  const slot = rule?.slots.find((s) => s.time === time);
  if (!rule || !slot || slot.imageIds.length === 0) throw new Error("画像が設定されていません");
  const today = jstNow();
  const base = { key: `test|${Date.now()}`, ruleId, ruleName: rule.name, date: today.date, time };
  try {
    const mediaIds: string[] = [];
    for (const id of slot.imageIds) mediaIds.push(await postStory(conn, imageUrl(id, origin)));
    const r: RunRecord = { ...base, status: "test", at: new Date().toISOString(), mediaIds };
    await addRun(r);
    return r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await addRun({ ...base, status: "error", at: new Date().toISOString(), detail: `試し: ${msg}` });
    throw new Error(msg);
  }
}
