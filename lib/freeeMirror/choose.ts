// 画面がどちらの口から読むかを決める純粋な関数（pickSource が使う）。
// 比べ終わるまでは freee から直接読み、切り替えのスイッチ（環境変数 KEIRI_READ_FROM=db）で写しに切り替える。

export function chooseSource(a: {
  param: string | null; // ?source=freee|db（比べるため）
  readFromDb: boolean; // 切り替えのスイッチ
  hasData: boolean; // 写しに1回でも取り込めている
  dbReady: boolean; // Supabase の環境変数がある
}): "db" | "freee" {
  if (a.param === "freee" || !a.dbReady) return "freee";
  if (a.param === "db") return "db";
  return a.readFromDb && a.hasData ? "db" : "freee";
}
