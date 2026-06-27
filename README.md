# flat. 立替精算アプリ

領収書をアップ → Claude（画像AI）が日付・金額・科目を自動判定 → 確認 → freee に登録、までを目指すアプリ。

## Phase 1（今ここ）
アップロード → AI抽出 → 確認画面。freee連携・ログイン・DBはまだ。

### 動かし方
1. 依存をインストール
   ```
   npm install
   ```
2. Claude APIキーを設定（`.env.example` をコピーして `.env.local` を作成）
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
   → https://console.anthropic.com で発行
3. 開発サーバ起動
   ```
   npm run dev
   ```
   → http://localhost:3000 を開く
4. 領収書の写真をアップ → AIが読み取った内容を確認

## ロードマップ
- **Phase 1**: アップ→AI抽出→確認 ✅（freee無し）
- **Phase 2**: Googleログイン（NextAuth）＋ freee OAuth ＋ 振替伝票（借:科目／貸:役員借入金）登録
- **Phase 3**: 役員借入金ダッシュボード（誰にいくら返すか）＋ 精算消し込み

## 技術
- Next.js (App Router) / TypeScript
- Claude `claude-opus-4-8`（Vision ＋ 構造化出力 `messages.parse`）
- 予定: Neon Postgres / Vercel Blob / NextAuth(Google) / freee API

## 科目（クロスウォーク）
`lib/receipt.ts` の `CATEGORIES` が freee へのマッピング元。
原価5区分＝freee「仕入高」＋品目、経費＝freee標準科目、設備＝固定資産。
