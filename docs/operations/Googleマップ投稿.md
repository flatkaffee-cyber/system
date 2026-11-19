# Googleマップへの投稿（/instagram）

2026-11-05 作成。インスタのフィード投稿を、そのままGoogleビジネスプロフィールの投稿にも流す。ストーリーは流さない（坂本さんの判断。文章が無く24時間で消えるため）。

## 動き
- 5分おきの cron（`/api/cron/instagram`、7:00〜22:55）が `/{ig-user-id}/media` を見て、新しいフィード投稿をGoogleに投稿する。アプリから手で上げたものも流れる
- 本文はキャプションからハッシュタグを除いたもの。写真は1枚目（動画はサムネイル）。インスタの投稿へのリンクボタンが付く
- Googleにつないだ時より前の投稿と、24時間より前の投稿は流さない
- 失敗したら1時間おきに試し、24時間で諦める。履歴に「フィード投稿（Google）」で残る
- 夜23時以降に上げた投稿は、翌朝7時の cron で流れる

## 使えるようになるまで（最初に1回）
1. Googleビジネスプロフィールが確認済みで60日以上たっていて、店のウェブサイトが登録されていること
2. Gmail連携で使っている Google Cloud プロジェクトの番号を控える（OAuthクライアントを共用するので、別のプロジェクトは作らない）
3. Google の「GBP API contact form」で「Application for Basic API Access」を出す。審査は14日程度
4. 通ると割り当てが 0 → 300 QPM になる。Cloud Console の API ライブラリで次を有効にする：Google My Business API、My Business Account Management API、My Business Business Information API
5. OAuth同意画面に `https://www.googleapis.com/auth/business.manage` を足す。「テスト」状態ならオーナーのGoogleアカウントをテストユーザーに足す（テスト状態のトークンは7日で切れるので、本番公開にしておく）
6. /instagram の「Googleマップの店につなぐ」を、店のオーナーのGoogleアカウントで開く

## 申請の記録（2026-11-16）
- flat.kaffee@gmail.com で「Application for Basic API Access」を送信済み。ケースID **0-6191000042339**。審査は7〜10営業日。結果は flat.kaffee@gmail.com にメールで届く。重ねて申請すると遅くなるので、出し直さない
- 中身：プロジェクト番号 626976120251（Gmail連携のOAuthクライアントのプロジェクト。本番の /api/google-business/authorize の client_id の頭の数字で確かめた）、会社サイト https://flat-cafe.vercel.app（誤り。開店前の古いサイトだった。インスタ https://www.instagram.com/flat.hikone/ に訂正する）、60日以上確認済み＝Yes、既に許可済みのプロジェクト＝No
- このプロジェクトは flat.kaffee@gmail.com のもの。2026-11-16時点では2段階認証が無効で、Cloud Console に入れなかった。手順4・5の前に、オーナーが2段階認証を有効にしておく
- ビジネスプロフィールにウェブサイトが無かったので、11/16 にインスタ https://www.instagram.com/flat.hikone/ を登録（格好いい公式サイトができたら差し替える）

### ケースへの訂正文（Googleからケースのメールが来たら、その返信で送る。11/16 時点ではメール未着）
> Hello, regarding case 0-6191000042339 (project number 626976120251): the company website I entered was incorrect. Our correct website is https://www.instagram.com/flat.hikone/ , which is also set as the website on our Business Profile "flat." (Hikone, Shiga). Thank you.

## 仕組みのメモ
- 接続は KV の `gbp:conn`（更新トークン・account・location・店名）。Gmailの `google:tokens` とは別
- OAuthの戻り先は既存の `/api/google/callback`。state が `gbp:` で始まるときだけこちらの処理に入る。リダイレクトURIを増やさなくて済む
- 投稿は `POST https://mybusiness.googleapis.com/v4/{account}/{location}/localPosts`。中身の組み立ては `lib/googleBusinessPost.ts`（テストあり）、呼び出しは `lib/googleBusiness.ts`
- キャプションに電話番号が入ると Google に弾かれることがある
- 同じ投稿を2回流さないよう KV の `gbp:media:<id>` で7日間覚える
- `/media` を今の Instagram トークンで読めるかは未確認（審査後の最初の投稿で確かめる）
