-- freee のデータの写し。正しいのは freee で、ここはシステムの取り込み（lib/freeeMirror/sync.ts）だけが書く。
-- raw は freee の API の応答をそのまま入れる。ほかの列は検索に使うために raw から取り出したもの。
-- どの表も RLS を有効にしてポリシーを作らない（サーバーの秘密の鍵でしか読み書きできない）。

create table freee_wallet_txns (
  company_id bigint not null, id bigint not null,
  walletable_type text not null, walletable_id bigint not null, date date not null, status int not null,
  raw jsonb not null, synced_at timestamptz not null, primary key (company_id, id));
create index on freee_wallet_txns (company_id, date);
create index on freee_wallet_txns (company_id, status);

create table freee_deals (company_id bigint not null, id bigint not null, issue_date date not null,
  raw jsonb not null, synced_at timestamptz not null, primary key (company_id, id));
create index on freee_deals (company_id, issue_date);

create table freee_manual_journals (company_id bigint not null, id bigint not null, issue_date date not null,
  raw jsonb not null, synced_at timestamptz not null, primary key (company_id, id));
create index on freee_manual_journals (company_id, issue_date);

create table freee_transfers (company_id bigint not null, id bigint not null, date date not null,
  raw jsonb not null, synced_at timestamptz not null, primary key (company_id, id));
create index on freee_transfers (company_id, date);

-- 一覧（walletables・account_items・partners）。1行に一覧まるごと
create table freee_masters (company_id bigint not null, kind text not null,
  raw jsonb not null, synced_at timestamptz not null, primary key (company_id, kind));

-- 試算表。trial_pl は月ごと（period = 2026-10）、trial_bs_partner は年度ごと（period = fy2026）
create table freee_reports (company_id bigint not null, kind text not null, period text not null,
  raw jsonb not null, up_to_date boolean not null, synced_at timestamptz not null, primary key (company_id, kind, period));

-- 取り込みの状態（会社ごとに1行）
create table freee_sync_state (company_id bigint primary key,
  last_success_at timestamptz, last_error text, last_error_at timestamptz, alerted_at timestamptz,
  last_nightly_date date, month_hashes jsonb not null default '{}');

-- 取り込みの記録（1回ごと）
create table freee_sync_runs (id bigserial primary key, company_id bigint not null, trigger text not null,
  nightly boolean not null, started_at timestamptz not null, finished_at timestamptz not null,
  ok boolean not null, error text, requests int not null, counts jsonb not null default '{}');
create index on freee_sync_runs (company_id, started_at desc);

alter table freee_wallet_txns enable row level security;
alter table freee_deals enable row level security;
alter table freee_manual_journals enable row level security;
alter table freee_transfers enable row level security;
alter table freee_masters enable row level security;
alter table freee_reports enable row level security;
alter table freee_sync_state enable row level security;
alter table freee_sync_runs enable row level security;
