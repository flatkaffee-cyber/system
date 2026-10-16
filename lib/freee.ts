// freee OAuth + APIクライアント。
// トークン保存は Vercel KV（@vercel/kv）。KV未設定なら NotConnected を投げ、
// 呼び出し側（払うものリスト等）はスナップショットにフォールバックする。

import { after } from "next/server";
import { accessTokenWithLock, type Tokens } from "@/lib/freeeMirror/refresh";

const AUTH_BASE = "https://accounts.secure.freee.co.jp/public_api";
const API_BASE = "https://api.freee.co.jp";
const TOKEN_KEY = "freee:tokens";

// 環境変数の BOM(U+FEFF)・ゼロ幅スペース(U+200B)・前後空白を除去
// （CLI経由で値の先頭にBOMが混入することがあるため）
function env(name: string): string {
  const raw = process.env[name] ?? "";
  return Array.from(raw)
    .filter((c) => {
      const code = c.charCodeAt(0);
      return code !== 0xfeff && code !== 0x200b;
    })
    .join("")
    .trim();
}

const CLIENT_ID = env("FREEE_CLIENT_ID");
const CLIENT_SECRET = env("FREEE_CLIENT_SECRET");

export const FREEE_COMPANY_ID = env("FREEE_COMPANY_ID") || "12575763";

export class FreeeNotConnected extends Error {
  constructor(msg = "freee未接続です") {
    super(msg);
    this.name = "FreeeNotConnected";
  }
}


// --- KV（保存先）。Vercel KV / Upstash Redis どちらの環境変数名でも拾う。
//     未設定なら null を返す。 ---
async function kv() {
  const url =
    process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export async function isKvReady(): Promise<boolean> {
  return !!(await kv());
}

async function loadTokens(): Promise<Tokens | null> {
  const store = await kv();
  if (!store) return null;
  return (await store.get<Tokens>(TOKEN_KEY)) ?? null;
}

async function saveTokens(t: Tokens): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定のためトークンを保存できません");
  await store.set(TOKEN_KEY, t);
}

export async function isConnected(): Promise<boolean> {
  try {
    return (await loadTokens()) !== null;
  } catch {
    return false;
  }
}

// --- OAuth ---
export function redirectUri(origin: string): string {
  return `${origin}/api/freee/callback`;
}

export function authorizeUrl(origin: string): string {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(origin),
    response_type: "code",
  });
  return `${AUTH_BASE}/authorize?${p.toString()}`;
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`freeeトークン取得失敗(${res.status}): ${txt}`);
  }
  const j = await res.json();
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (j.expires_in ?? 86400),
  };
}

export async function exchangeCode(origin: string, code: string): Promise<void> {
  const t = await tokenRequest({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: redirectUri(origin),
  });
  await saveTokens(t);
}

async function getAccessToken(): Promise<string> {
  const store = await kv();
  if (!store) throw new FreeeNotConnected();
  // 期限60秒前で更新（freeeはrefresh_tokenが毎回ローテートするので保存必須）。
  // 並べて呼ぶ処理が同時に更新すると古い方が失敗するので、更新は鍵を取った1つだけが行う
  return accessTokenWithLock({
    kv: store,
    load: loadTokens,
    save: saveTokens,
    refresh: (refreshToken) =>
      tokenRequest({
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
      }),
    nowSec: () => Math.floor(Date.now() / 1000),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    notConnected: () => new FreeeNotConnected(),
  });
}

// --- API ---
export async function freeeGet<T = unknown>(
  path: string,
  query: Record<string, string> = {},
): Promise<T> {
  const token = await getAccessToken();
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${API_BASE}${path}${qs ? `?${qs}` : ""}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Api-Version": "2020-06-15",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`freee API ${path} 失敗(${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/**
 * limit=100 でページを送り、最後まで取る（freee は limit 未指定だと20件しか返さない）。
 * get を渡すと、1ページごとの取り方（やり直し・回数を数えるなど）を差し替えられる
 */
export async function fetchAll<T>(
  path: string,
  key: string,
  query: Record<string, string>,
  get: <R>(path: string, query: Record<string, string>) => Promise<R> = freeeGet,
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const page =
      ((await get<Record<string, T[]>>(path, { ...query, limit: "100", offset: String(offset) }))[key]) ?? [];
    out.push(...page);
    if (page.length < 100) break;
  }
  return out;
}

// freee に書き込めたら、応答を返したあとで「書き込んだ」印を付ける。毎分の cron がそれを見て Supabase の写しを
// 取り込み直す（5分待たずに画面に出すため）。取り込みそのものをここで回さないのは、書き込んだルートの
// 時間制限（30秒のものが多い）の中で打ち切られないようにするため
function markDirtyAfterResponse() {
  try {
    after(async () => {
      // 動的 import にするのは sync.ts → live.ts → このファイル の循環を避けるため
      const { markDirty } = await import("@/lib/freeeMirror/sync");
      await markDirty().catch(() => {});
    });
  } catch {
    // リクエストの外（スクリプトなど）では after が使えない。取り込みは次の cron に任せる
  }
}

export async function freeePost<T = unknown>(
  path: string,
  body: unknown,
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Api-Version": "2020-06-15",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`freee API POST ${path} 失敗(${res.status}): ${await res.text()}`);
  }
  markDirtyAfterResponse();
  return (await res.json()) as T;
}

export async function freeePut<T = unknown>(
  path: string,
  body: unknown,
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Api-Version": "2020-06-15",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`freee API PUT ${path} 失敗(${res.status}): ${text.slice(0, 300)}`);
  }
  markDirtyAfterResponse();
  return (text ? JSON.parse(text) : {}) as T;
}

export async function freeeDelete(path: string, query: Record<string, string> = {}): Promise<void> {
  const token = await getAccessToken();
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${API_BASE}${path}${qs ? `?${qs}` : ""}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Api-Version": "2020-06-15",
      Accept: "application/json",
    },
  });
  // 204/200 は成功。既に無い(404)も成功扱い。
  if (!res.ok && res.status !== 404) {
    throw new Error(`freee API DELETE ${path} 失敗(${res.status}): ${await res.text()}`);
  }
  markDirtyAfterResponse();
}
