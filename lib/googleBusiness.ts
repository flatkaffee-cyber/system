// Googleビジネスプロフィール（Googleマップの店の情報）への投稿。
//
// 2026-11 インスタのフィード投稿を、そのままGoogleにも流すために作った（ストーリーは流さない）。
// - OAuthのクライアントは Gmail 連携（lib/google.ts）と同じものを使う。戻り先も /api/google/callback
// - ただしトークンは別に持つ。Gmail と店のオーナーが別のGoogleアカウントでも困らないように
// - Business Profile API は Google の審査が通るまで使えない（docs/operations/Googleマップ投稿.md）

import { buildLocalPost, pickLocation } from "@/lib/googleBusinessPost";

const KEY_CONN = "gbp:conn";
const SCOPE = "https://www.googleapis.com/auth/business.manage";

function env(name: string): string {
  return (process.env[name] ?? "").replace(/[﻿​]/g, "").trim();
}

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type GbpConn = {
  refreshToken: string;
  /** accounts/123 の形 */
  account: string;
  /** locations/456 の形 */
  location: string;
  title: string;
  savedAt: string;
  lastError?: string;
};

export async function getGbpConn(): Promise<GbpConn | null> {
  const store = await kv();
  if (!store) return null;
  return (await store.get<GbpConn>(KEY_CONN)) ?? null;
}

async function putGbpConn(conn: GbpConn): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  await store.set(KEY_CONN, conn);
}

export async function disconnectGbp(): Promise<void> {
  const store = await kv();
  if (store) await store.del(KEY_CONN);
}

export function gbpAuthorizeUrl(origin: string, state: string): string {
  const p = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"),
    redirect_uri: `${origin}/api/google/callback`,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

async function tokenReq(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      ...body,
    }),
    cache: "no-store",
  });
  const d = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    error_description?: string;
    error?: string;
  };
  if (!res.ok || !d.access_token) {
    throw new Error(d.error_description || d.error || `Googleの認証に失敗しました（${res.status}）`);
  }
  return d as { access_token: string; refresh_token?: string };
}

async function call<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(body.error?.message || `Google API ${res.status}`);
  return body;
}

/** 認可コードを受け取って、店を見つけて保存する。審査が通っていないとここで失敗する */
export async function connectGbp(origin: string, code: string): Promise<GbpConn> {
  const t = await tokenReq({
    code,
    grant_type: "authorization_code",
    redirect_uri: `${origin}/api/google/callback`,
  });
  if (!t.refresh_token) throw new Error("更新用のトークンが返ってきませんでした。もう一度つないでください");

  const accounts = await call<{ accounts?: { name: string }[] }>(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    t.access_token,
  );
  for (const a of accounts.accounts ?? []) {
    const r = await call<{ locations?: { name: string; title?: string }[] }>(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title`,
      t.access_token,
    );
    const loc = pickLocation(r.locations ?? []);
    if (!loc) continue;
    const conn: GbpConn = {
      refreshToken: t.refresh_token,
      account: a.name,
      location: loc.name,
      title: loc.title || "",
      savedAt: new Date().toISOString(),
    };
    await putGbpConn(conn);
    return conn;
  }
  throw new Error("このGoogleアカウントで管理している店が見つかりませんでした");
}

/** 投稿して、できた投稿の名前を返す */
export async function postToGoogle(conn: GbpConn, summary: string, imageUrl?: string, linkUrl?: string): Promise<string> {
  const body = buildLocalPost(summary, imageUrl, linkUrl);
  try {
    const { access_token } = await tokenReq({ grant_type: "refresh_token", refresh_token: conn.refreshToken });
    const r = await call<{ name: string }>(
      `https://mybusiness.googleapis.com/v4/${conn.account}/${conn.location}/localPosts`,
      access_token,
      { method: "POST", body: JSON.stringify(body) },
    );
    if (conn.lastError) await putGbpConn({ ...conn, lastError: undefined });
    return r.name;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await putGbpConn({ ...conn, lastError: msg });
    throw new Error(msg);
  }
}
