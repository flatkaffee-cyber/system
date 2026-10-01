import type { NextRequest } from "next/server";

// サーバーの中から自分のAPIを呼ぶときに付けるヘッダ。
//
// サイト全体に合言葉をかけてから、サーバー内の呼び出しにも合言葉が要るようになった。
// 元のリクエストのクッキー（画面から来たとき）と authorization（Vercelの自動実行から来たとき）を
// そのまま引き継がないと、呼び先で「合言葉が必要です」と断られ、売上0などの誤った結果になる。
export function passAuth(req: NextRequest): Record<string, string> {
  const h: Record<string, string> = {};
  const cookie = req.headers.get("cookie");
  if (cookie) h.cookie = cookie;
  const auth = req.headers.get("authorization");
  if (auth) h.authorization = auth;
  return h;
}
