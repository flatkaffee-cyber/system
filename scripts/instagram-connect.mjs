// インスタのトークンを本番の /instagram に保存する。
//
// 使い方：Metaの画面でトークンをコピーしてから
//   node scripts/instagram-connect.mjs
// クリップボードのトークンを読んで、本番の接続にそのまま渡す。
// トークンは画面に出さない。合言葉は .env.local の SITE_PASSWORD を使う。

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BASE = process.env.IG_CONNECT_BASE || "https://flat-keihi.vercel.app";
// flat.hikone のアカウントID（Metaのトークン画面に出ている番号）
const USER_ID = process.env.IG_USER_ID || "17841441347584460";

function envLocal(name) {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const line = text.split("\n").find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^"|"$/g, "") : "";
}

const token = execSync("pbpaste").toString().trim();
if (!/^(EAA|IG)/.test(token)) {
  console.error("クリップボードにトークンがありません。Metaの画面でトークンをコピーしてから、もう一度実行してください。");
  process.exit(1);
}
console.log(`トークンを読みました（${token.slice(0, 4)}… ${token.length}文字）`);

const login = await fetch(`${BASE}/api/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: envLocal("SITE_PASSWORD") }),
});
if (!login.ok) {
  console.error(`合言葉で入れませんでした（${login.status}）`);
  process.exit(1);
}
const cookie = (login.headers.get("set-cookie") || "").split(";")[0];

const res = await fetch(`${BASE}/api/instagram`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({
    action: "connect",
    token,
    ...(token.startsWith("EAA") ? { userId: USER_ID } : {}),
  }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`保存できませんでした：${body.error || res.status}`);
  process.exit(1);
}
console.log(`保存しました。@${body.username} とつながっています。`);
