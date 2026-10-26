-- 仕入れ表（何をどこでいくらで買うか）。2026-10-26 までは Google スプレッドシートにあったが、
-- 毎回 Google の連携が要るので Supabase に移した。画面（仕入れ → 仕入れ表）から足す・直す・消す。
-- RLS を有効にしてポリシーを作らない（サーバーの秘密の鍵でしか読み書きできない）。

create table shiire_items (
  id bigint generated always as identity primary key,
  section text not null,              -- 見出し（ドリンク・ドリンク（酒）・冷凍・ワッフル・消耗品・包材・フード など）
  name text not null,                 -- 仕入れ物
  supplier text not null default '',  -- 仕入れ先
  url text not null default '',       -- 買うページ
  price integer,                      -- 価格（税込・円）。分からなければ null
  capacity text not null default '',  -- 容量（例 1000ml・227g）
  note text not null default '',
  order_qty text not null default '', -- 1回の発注量の目安
  sort integer not null default 0,    -- 見出しの中の並び
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on shiire_items (section, sort);
alter table shiire_items enable row level security;
