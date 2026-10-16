// Supabase のクライアント。サーバーからだけ使う（秘密の鍵はブラウザに出さない）。
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FREEE_COMPANY_ID } from "@/lib/freee";

export const COMPANY_ID = Number(FREEE_COMPANY_ID);

// 環境変数の BOM・ゼロ幅スペース・前後の空白を外す（lib/freee.ts と同じ理由）
const env = (name: string) => (process.env[name] ?? "").replace(/[﻿​]/g, "").trim();

let client: SupabaseClient | null = null;

export function isDbReady(): boolean {
  return !!env("SUPABASE_URL") && !!env("SUPABASE_SECRET_KEY");
}

export function db(): SupabaseClient {
  if (!isDbReady()) throw new Error("Supabase未設定");
  client ??= createClient(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
