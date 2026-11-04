# Googleマップへの投稿（/instagram）

2026-11-05 作成。定期ストーリーと同じ画像を、Googleビジネスプロフィールの投稿にも出す。決まりごとに「Googleマップにも出す」を選び、文章を入れる（ストーリーは画像だけだが、Googleは本文が要る）。

## 動き
- 5分おきの cron（`/api/cron/instagram`）がストーリーを上げたあとに続けて投稿する。手で上げてストーリーを飛ばした日も、Googleには出す
- 画像は1枚目だけ。URLはインスタと同じ `/api/instagram/img/<id>.jpg`
- 失敗してもストーリーには影響しない。履歴に「（Google）」付きで残る。再試行はしない
- 「Googleに今すぐ出す」ボタンは接続後に出る。お客さんに見える本番投稿になる

## 使えるようになるまで（最初に1回）
1. Googleビジネスプロフィールが確認済みで60日以上たっていて、店のウェブサイトが登録されていること
2. Gmail連携で使っている Google Cloud プロジェクトの番号を控える（OAuthクライアントを共用するので、別のプロジェクトは作らない）
3. Google の「GBP API contact form」で「Application for Basic API Access」を出す。審査は14日程度
4. 通ると割り当てが 0 → 300 QPM になる。Cloud Console の API ライブラリで次を有効にする：Google My Business API、My Business Account Management API、My Business Business Information API
5. OAuth同意画面に `https://www.googleapis.com/auth/business.manage` を足す。「テスト」状態ならオーナーのGoogleアカウントをテストユーザーに足す（テスト状態のトークンは7日で切れるので、本番公開にしておく）
6. /instagram の「Googleマップの店につなぐ」を、店のオーナーのGoogleアカウントで開く

## 仕組みのメモ
- 接続は KV の `gbp:conn`（更新トークン・account・location・店名）。Gmailの `google:tokens` とは別
- OAuthの戻り先は既存の `/api/google/callback`。state が `gbp:` で始まるときだけこちらの処理に入る。リダイレクトURIを増やさなくて済む
- 投稿は `POST https://mybusiness.googleapis.com/v4/{account}/{location}/localPosts`。中身の組み立ては `lib/googleBusinessPost.ts`（テストあり）、呼び出しは `lib/googleBusiness.ts`
- 本文に電話番号が入ると Google に弾かれることがある
