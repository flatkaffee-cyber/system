// 日報。シフトに入った人が、テンプレート（lib/nippoFields）に沿って書く。
// 業務チェック（/opening）の下に、その日シフトに入った人ごとに「提出／下書き／まだ」と中身を出す。
// 2026-11-09 坂本さん「システムに日報を書き込む機能。業務チェックで、その日入った人の日報を見られるように」
// 同日「テンプレがあってそこに入れられるように。下書き保存されるように」
//
// 日ごとに1つのキー（nippo:YYYY-MM-DD）に、名前 → 日報 で持つ。書いている途中は draft=true で自動保存する。

import type { NippoKey } from "@/lib/nippoFields";

export type Nippo = {
  name: string;
  /** 何時時点の日報か（"13:00"） */
  asOf?: string;
  /** 書いている途中（下書き）。提出すると false */
  draft?: boolean;
  /** 書いた（直した）時刻 */
  at: string;
} & Partial<Record<NippoKey, string>>;

export { NIPPO_FIELDS } from "@/lib/nippoFields";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

const key = (date: string) => `nippo:${date}`;

export async function getNippo(date: string): Promise<Record<string, Nippo>> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<Record<string, Nippo>>(key(date))) ?? {};
}

export async function saveNippo(date: string, n: Nippo): Promise<Record<string, Nippo>> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = await getNippo(date);
  all[n.name] = n;
  await store.set(key(date), all);
  return all;
}
