-- Nyaru initial schema (single-guild)

create extension if not exists pgcrypto;

do $$ begin
  create type role_sync_job_status as enum ('pending', 'running', 'succeeded', 'failed');
exception
  when duplicate_object then null;
end $$;

create table if not exists app_config (
  id smallint primary key check (id = 1),
  guild_id text not null,
  admin_role_ids text[] not null default '{}',
  join_message_template text,

  reward_points_per_interval integer not null default 10,
  reward_interval_seconds integer not null default 180,
  reward_daily_cap_points integer,
  reward_min_message_length integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reward_channels (
  channel_id text primary key,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  discord_user_id text primary key,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists point_balances (
  discord_user_id text primary key references users(discord_user_id) on delete cascade,
  balance integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists point_events (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null references users(discord_user_id) on delete cascade,
  kind text not null,
  amount integer not null,
  idempotency_key text unique,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists point_events_user_time_idx on point_events(discord_user_id, created_at desc);

create table if not exists items (
  item_id uuid primary key default gen_random_uuid(),
  name text not null,
  rarity text not null,
  discord_role_id text,
  is_active boolean not null default true,
  is_equippable boolean not null default true,
  duplicate_refund_points integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_discord_role_unique unique (discord_role_id)
);

create table if not exists gacha_pools (
  pool_id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  cost_points integer not null default 0,
  paid_pull_cooldown_seconds integer not null default 0,
  free_pull_interval_seconds integer,
  pity_threshold integer,
  pity_rarity text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists gacha_pool_items (
  pool_id uuid not null references gacha_pools(pool_id) on delete cascade,
  item_id uuid not null references items(item_id) on delete cascade,
  weight integer not null default 1,
  primary key (pool_id, item_id)
);

create table if not exists gacha_user_state (
  discord_user_id text not null references users(discord_user_id) on delete cascade,
  pool_id uuid not null references gacha_pools(pool_id) on delete cascade,
  pity_counter integer not null default 0,
  free_available_at timestamptz,
  paid_available_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (discord_user_id, pool_id)
);

create table if not exists gacha_pulls (
  pull_id uuid primary key default gen_random_uuid(),
  discord_user_id text not null references users(discord_user_id) on delete cascade,
  pool_id uuid not null references gacha_pools(pool_id) on delete cascade,
  is_free boolean not null default false,
  spent_points integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists gacha_pulls_user_time_idx on gacha_pulls(discord_user_id, created_at desc);

create table if not exists gacha_pull_results (
  pull_id uuid not null references gacha_pulls(pull_id) on delete cascade,
  item_id uuid not null references items(item_id) on delete cascade,
  qty integer not null default 1,
  primary key (pull_id, item_id)
);

create table if not exists inventory (
  discord_user_id text not null references users(discord_user_id) on delete cascade,
  item_id uuid not null references items(item_id) on delete cascade,
  qty integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (discord_user_id, item_id),
  constraint inventory_qty_nonnegative check (qty >= 0)
);

create table if not exists equipped (
  discord_user_id text primary key references users(discord_user_id) on delete cascade,
  item_id uuid references items(item_id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists role_sync_jobs (
  job_id uuid primary key default gen_random_uuid(),
  discord_user_id text not null references users(discord_user_id) on delete cascade,
  add_role_id text,
  remove_role_id text,
  reason text not null default '',
  status role_sync_job_status not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists role_sync_jobs_status_idx on role_sync_jobs(status, created_at);
