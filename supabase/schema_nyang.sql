-- Nyaru DB schema (single source of truth)
--
-- This file is intended to be the authoritative DDL for the `nyang` schema.
-- Run on an empty DB, or after dropping the schema.
--
-- Optional full reset (DANGEROUS):
--   drop schema if exists nyang cascade;

create extension if not exists pgcrypto;

create schema if not exists nyang;

-- Types
do $$
begin
  create type nyang.role_sync_job_status as enum ('pending', 'running', 'succeeded', 'failed');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type nyang.gacha_pool_kind as enum ('permanent', 'limited');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type nyang.gacha_rarity as enum ('R', 'S', 'SS', 'SSS');
exception
  when duplicate_object then null;
end
$$;

-- Tables
create table if not exists nyang.app_config (
  id smallint primary key check (id = 1),
  guild_id text not null,
  admin_role_ids text[] not null default '{}',
  join_message_template text,
  join_message_channel_id text,
  music_command_channel_id text,
  music_setup_embed_title text,
  music_setup_embed_description text,
  music_setup_embed_fields jsonb,
  music_setup_message_id text,
  server_intro text,
  banner_image_url text,
  icon_image_url text,
  reward_points_per_interval integer not null default 10,
  reward_interval_seconds integer not null default 180,
  reward_daily_cap_points integer,
  reward_min_message_length integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists nyang.reward_channels (
  channel_id text primary key,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists nyang.users (
  discord_user_id text primary key,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists nyang.point_balances (
  discord_user_id text primary key references nyang.users(discord_user_id) on delete cascade,
  balance integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists nyang.point_events (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null references nyang.users(discord_user_id) on delete cascade,
  kind text not null,
  amount integer not null,
  idempotency_key text unique,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists point_events_user_time_idx on nyang.point_events(discord_user_id, created_at desc);

create table if not exists nyang.items (
  item_id uuid primary key default gen_random_uuid(),
  name text not null,
  rarity nyang.gacha_rarity not null,
  discord_role_id text,
  is_active boolean not null default true,
  is_equippable boolean not null default true,
  duplicate_refund_points integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_discord_role_unique unique (discord_role_id)
);

-- If the table already existed, align rarity type.
alter table nyang.items
  alter column rarity type nyang.gacha_rarity using rarity::nyang.gacha_rarity;

create table if not exists nyang.gacha_pools (
  pool_id uuid primary key default gen_random_uuid(),
  name text not null,
  kind nyang.gacha_pool_kind not null default 'permanent',
  is_active boolean not null default true,
  banner_image_url text,
  cost_points integer not null default 0,
  paid_pull_cooldown_seconds integer not null default 0,
  free_pull_interval_seconds integer,
  rate_r integer not null default 5,
  rate_s integer not null default 75,
  rate_ss integer not null default 17,
  rate_sss integer not null default 3,
  pity_threshold integer,
  pity_rarity nyang.gacha_rarity,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gacha_pools_rate_sum_check check (rate_r + rate_s + rate_ss + rate_sss = 100)
);

-- If the table already existed, ensure new columns/constraints are present.
alter table nyang.gacha_pools
  add column if not exists kind nyang.gacha_pool_kind not null default 'permanent',
  add column if not exists banner_image_url text,
  add column if not exists rate_r integer not null default 5,
  add column if not exists rate_s integer not null default 75,
  add column if not exists rate_ss integer not null default 17,
  add column if not exists rate_sss integer not null default 3;

alter table nyang.gacha_pools
  alter column pity_rarity type nyang.gacha_rarity using pity_rarity::nyang.gacha_rarity;

alter table nyang.gacha_pools
  drop constraint if exists gacha_pools_rate_sum_check;

alter table nyang.gacha_pools
  add constraint gacha_pools_rate_sum_check check (rate_r + rate_s + rate_ss + rate_sss = 100);

create table if not exists nyang.gacha_pool_items (
  pool_id uuid not null references nyang.gacha_pools(pool_id) on delete cascade,
  item_id uuid not null references nyang.items(item_id) on delete cascade,
  weight integer not null default 1,
  primary key (pool_id, item_id)
);

create table if not exists nyang.gacha_user_state (
  discord_user_id text not null references nyang.users(discord_user_id) on delete cascade,
  pool_id uuid not null references nyang.gacha_pools(pool_id) on delete cascade,
  pity_counter integer not null default 0,
  free_available_at timestamptz,
  paid_available_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (discord_user_id, pool_id)
);

create table if not exists nyang.gacha_pulls (
  pull_id uuid primary key default gen_random_uuid(),
  discord_user_id text not null references nyang.users(discord_user_id) on delete cascade,
  pool_id uuid not null references nyang.gacha_pools(pool_id) on delete cascade,
  is_free boolean not null default false,
  spent_points integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists gacha_pulls_user_time_idx on nyang.gacha_pulls(discord_user_id, created_at desc);

create table if not exists nyang.gacha_pull_results (
  pull_id uuid not null references nyang.gacha_pulls(pull_id) on delete cascade,
  item_id uuid not null references nyang.items(item_id) on delete cascade,
  qty integer not null default 1,
  primary key (pull_id, item_id)
);

create table if not exists nyang.inventory (
  discord_user_id text not null references nyang.users(discord_user_id) on delete cascade,
  item_id uuid not null references nyang.items(item_id) on delete cascade,
  qty integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (discord_user_id, item_id),
  constraint inventory_qty_nonnegative check (qty >= 0)
);

create table if not exists nyang.equipped (
  discord_user_id text primary key references nyang.users(discord_user_id) on delete cascade,
  item_id uuid references nyang.items(item_id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists nyang.role_sync_jobs (
  job_id uuid primary key default gen_random_uuid(),
  discord_user_id text not null references nyang.users(discord_user_id) on delete cascade,
  add_role_id text,
  remove_role_id text,
  reason text not null default '',
  status nyang.role_sync_job_status not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists role_sync_jobs_status_idx on nyang.role_sync_jobs(status, created_at);

-- RPC functions

-- NOTE: Postgres cannot change a function's OUT/RETURNS TABLE signature via CREATE OR REPLACE.
-- Drop first so re-running this file is safe when return types change.
drop function if exists nyang.perform_gacha_draw(text, uuid);
drop function if exists nyang.set_equipped_item(text, uuid);
drop function if exists nyang.grant_chat_points(text, text, integer, timestamptz, text);
drop function if exists nyang.admin_adjust_points(text, integer, text);
drop function if exists nyang.ensure_user(text);

create or replace function nyang.ensure_user(p_discord_user_id text)
returns void
language plpgsql
set search_path = nyang, public
as $$
begin
  insert into users(discord_user_id) values (p_discord_user_id)
  on conflict (discord_user_id) do update set last_seen_at = now();

  insert into point_balances(discord_user_id, balance) values (p_discord_user_id, 0)
  on conflict (discord_user_id) do nothing;
end;
$$;

create or replace function nyang.admin_adjust_points(
  p_discord_user_id text,
  p_amount integer,
  p_reason text default ''
)
returns integer
language plpgsql
set search_path = nyang, public
as $$
declare
  v_balance integer;
begin
  perform ensure_user(p_discord_user_id);

  insert into point_events(discord_user_id, kind, amount, meta)
  values (p_discord_user_id, 'admin_adjust', p_amount, jsonb_build_object('reason', p_reason));

  update point_balances
    set balance = balance + p_amount,
        updated_at = now()
    where discord_user_id = p_discord_user_id
    returning balance into v_balance;

  return v_balance;
end;
$$;

create or replace function nyang.perform_gacha_draw(
  p_discord_user_id text,
  p_pool_id uuid default null
)
returns table (
  item_id uuid,
  name text,
  rarity nyang.gacha_rarity,
  discord_role_id text,
  is_free boolean,
  refund_points integer,
  new_balance integer
)
language plpgsql
set search_path = nyang, public
as $$
declare
  v_pool gacha_pools%rowtype;
  v_state gacha_user_state%rowtype;
  v_now timestamptz := now();
  v_free_ok boolean := false;
  v_paid_ok boolean := true;
  v_spend integer := 0;
  v_refund integer := 0;
  v_balance integer := 0;
  v_item record;
  v_pull_id uuid;
  v_current_qty integer := 0;
  v_force_rarity boolean := false;
  v_rarity nyang.gacha_rarity;
  v_roll integer;
begin
  perform ensure_user(p_discord_user_id);

  if p_pool_id is null then
    select * into v_pool
    from gacha_pools
    where is_active = true
    order by created_at asc
    limit 1;
  else
    select * into v_pool
    from gacha_pools
    where pool_id = p_pool_id and is_active = true;
  end if;

  if not found then
    raise exception 'NO_ACTIVE_POOL';
  end if;

  insert into gacha_user_state(discord_user_id, pool_id)
  values (p_discord_user_id, v_pool.pool_id)
  on conflict (discord_user_id, pool_id) do nothing;

  select * into v_state
  from gacha_user_state
  where discord_user_id = p_discord_user_id and pool_id = v_pool.pool_id
  for update;

  if v_pool.free_pull_interval_seconds is not null then
    v_free_ok := (v_state.free_available_at is null) or (v_state.free_available_at <= v_now);
  end if;

  v_paid_ok := (v_state.paid_available_at is null) or (v_state.paid_available_at <= v_now);

  if v_free_ok then
    is_free := true;
    v_spend := 0;
  else
    is_free := false;
    if not v_paid_ok then
      raise exception 'PAID_COOLDOWN';
    end if;
    v_spend := greatest(v_pool.cost_points, 0);
  end if;

  select balance into v_balance from point_balances where discord_user_id = p_discord_user_id for update;
  if (not is_free) and v_balance < v_spend then
    raise exception 'INSUFFICIENT_POINTS';
  end if;

  if v_pool.pity_threshold is not null and v_pool.pity_rarity is not null then
    if v_state.pity_counter >= greatest(v_pool.pity_threshold - 1, 0) then
      v_force_rarity := true;
    end if;
  end if;

  if v_force_rarity then
    v_rarity := v_pool.pity_rarity;
  else
    v_roll := floor(random() * 100)::integer + 1;
    if v_roll <= v_pool.rate_r then
      v_rarity := 'R';
    elsif v_roll <= v_pool.rate_r + v_pool.rate_s then
      v_rarity := 'S';
    elsif v_roll <= v_pool.rate_r + v_pool.rate_s + v_pool.rate_ss then
      v_rarity := 'SS';
    else
      v_rarity := 'SSS';
    end if;
  end if;

  with candidates as (
    select
      i.item_id,
      i.name,
      i.rarity,
      i.discord_role_id,
      i.duplicate_refund_points,
      gpi.weight
    from gacha_pool_items gpi
    join items i on i.item_id = gpi.item_id
    where
      gpi.pool_id = v_pool.pool_id
      and i.is_active = true
      and i.is_equippable = true
      and gpi.weight > 0
      and i.rarity = v_rarity
  ),
  weighted as (
    select
      c.*,
      sum(c.weight) over () as total_weight,
      sum(c.weight) over (order by c.item_id) as cum_weight
    from candidates c
  ),
  choice as (
    select *
    from weighted
    where cum_weight >= (random() * total_weight)
    order by cum_weight asc
    limit 1
  )
  select * into v_item from choice;

  if v_item is null then
    -- fallback: any rarity
    with candidates as (
      select
        i.item_id,
        i.name,
        i.rarity,
        i.discord_role_id,
        i.duplicate_refund_points,
        gpi.weight
      from gacha_pool_items gpi
      join items i on i.item_id = gpi.item_id
      where
        gpi.pool_id = v_pool.pool_id
        and i.is_active = true
        and i.is_equippable = true
        and gpi.weight > 0
    ),
    weighted as (
      select
        c.*,
        sum(c.weight) over () as total_weight,
        sum(c.weight) over (order by c.item_id) as cum_weight
      from candidates c
    ),
    choice as (
      select *
      from weighted
      where cum_weight >= (random() * total_weight)
      order by cum_weight asc
      limit 1
    )
    select * into v_item from choice;
  end if;

  if v_item is null then
    raise exception 'POOL_EMPTY';
  end if;

  select qty into v_current_qty
  from inventory
  where discord_user_id = p_discord_user_id and item_id = v_item.item_id;

  if coalesce(v_current_qty, 0) > 0 then
    v_refund := greatest(coalesce(v_item.duplicate_refund_points, 0), 0);
  else
    v_refund := 0;
  end if;

  insert into gacha_pulls(discord_user_id, pool_id, is_free, spent_points)
  values (p_discord_user_id, v_pool.pool_id, is_free, v_spend)
  returning pull_id into v_pull_id;

  insert into gacha_pull_results(pull_id, item_id, qty)
  values (v_pull_id, v_item.item_id, 1)
  on conflict (pull_id, item_id) do update set qty = gacha_pull_results.qty + 1;

  insert into inventory(discord_user_id, item_id, qty)
  values (p_discord_user_id, v_item.item_id, 1)
  on conflict (discord_user_id, item_id) do update
    set qty = inventory.qty + 1,
        updated_at = now();

  if (not is_free) and v_spend <> 0 then
    insert into point_events(discord_user_id, kind, amount, meta)
    values (p_discord_user_id, 'gacha_spend', -v_spend, jsonb_build_object('pool_id', v_pool.pool_id, 'pull_id', v_pull_id));
    update point_balances
      set balance = balance - v_spend,
          updated_at = now()
    where discord_user_id = p_discord_user_id;
  end if;

  if v_refund <> 0 then
    insert into point_events(discord_user_id, kind, amount, meta)
    values (p_discord_user_id, 'duplicate_refund', v_refund, jsonb_build_object('item_id', v_item.item_id, 'pull_id', v_pull_id));
    update point_balances
      set balance = balance + v_refund,
          updated_at = now()
    where discord_user_id = p_discord_user_id;
  end if;

  if is_free and v_pool.free_pull_interval_seconds is not null then
    update gacha_user_state
      set free_available_at = v_now + make_interval(secs => v_pool.free_pull_interval_seconds),
          updated_at = now()
      where discord_user_id = p_discord_user_id and pool_id = v_pool.pool_id;
  elsif (not is_free) and v_pool.paid_pull_cooldown_seconds is not null and v_pool.paid_pull_cooldown_seconds > 0 then
    update gacha_user_state
      set paid_available_at = v_now + make_interval(secs => v_pool.paid_pull_cooldown_seconds),
          updated_at = now()
      where discord_user_id = p_discord_user_id and pool_id = v_pool.pool_id;
  else
    update gacha_user_state
      set updated_at = now()
      where discord_user_id = p_discord_user_id and pool_id = v_pool.pool_id;
  end if;

  if v_pool.pity_threshold is not null and v_pool.pity_rarity is not null then
    if v_item.rarity = v_pool.pity_rarity then
      update gacha_user_state
        set pity_counter = 0
        where discord_user_id = p_discord_user_id and pool_id = v_pool.pool_id;
    else
      update gacha_user_state
        set pity_counter = pity_counter + 1
        where discord_user_id = p_discord_user_id and pool_id = v_pool.pool_id;
    end if;
  end if;

  select balance into v_balance from point_balances where discord_user_id = p_discord_user_id;

  item_id := v_item.item_id;
  name := v_item.name;
  rarity := v_item.rarity;
  discord_role_id := v_item.discord_role_id;
  refund_points := v_refund;
  new_balance := v_balance;
  return next;
end;
$$;

create or replace function nyang.set_equipped_item(
  p_discord_user_id text,
  p_item_id uuid
)
returns table (
  previous_item_id uuid,
  new_item_id uuid,
  previous_role_id text,
  new_role_id text
)
language plpgsql
set search_path = nyang, public
as $$
declare
  v_prev_item uuid;
  v_prev_role text;
  v_new_role text;
  v_qty integer;
begin
  perform ensure_user(p_discord_user_id);

  select item_id into v_prev_item
  from equipped
  where discord_user_id = p_discord_user_id
  for update;

  if v_prev_item is not null then
    select discord_role_id into v_prev_role from items where item_id = v_prev_item;
  else
    v_prev_role := null;
  end if;

  if p_item_id is not null then
    select qty into v_qty from inventory where discord_user_id = p_discord_user_id and item_id = p_item_id;
    if coalesce(v_qty, 0) <= 0 then
      raise exception 'ITEM_NOT_OWNED';
    end if;

    select discord_role_id into v_new_role
    from items
    where item_id = p_item_id and is_active = true and is_equippable = true;

    if not found then
      raise exception 'ITEM_NOT_EQUIPPABLE';
    end if;
  else
    v_new_role := null;
  end if;

  if v_prev_item is distinct from p_item_id then
    insert into equipped(discord_user_id, item_id)
    values (p_discord_user_id, p_item_id)
    on conflict (discord_user_id) do update
      set item_id = excluded.item_id,
          updated_at = now();

    if v_prev_role is not null and (v_prev_role is distinct from v_new_role) then
      insert into role_sync_jobs(discord_user_id, remove_role_id, reason)
      values (p_discord_user_id, v_prev_role, 'unequip');
    end if;

    if v_new_role is not null and (v_prev_role is distinct from v_new_role) then
      insert into role_sync_jobs(discord_user_id, add_role_id, reason)
      values (p_discord_user_id, v_new_role, 'equip');
    end if;
  end if;

  previous_item_id := v_prev_item;
  new_item_id := p_item_id;
  previous_role_id := v_prev_role;
  new_role_id := v_new_role;
  return next;
end;
$$;

create or replace function nyang.grant_chat_points(
  p_discord_user_id text,
  p_channel_id text,
  p_message_length integer,
  p_message_ts timestamptz,
  p_message_id text default null
)
returns table (
  granted_points integer,
  new_balance integer
)
language plpgsql
set search_path = nyang, public
as $$
declare
  v_cfg app_config%rowtype;
  v_enabled boolean;
  v_bucket_start timestamptz;
  v_key text;
  v_daily_sum integer;
begin
  perform ensure_user(p_discord_user_id);

  select * into v_cfg from app_config where id = 1;
  if not found then
    raise exception 'CONFIG_MISSING';
  end if;

  select enabled into v_enabled
  from reward_channels
  where channel_id = p_channel_id;

  if coalesce(v_enabled, false) is not true then
    granted_points := 0;
    select balance into new_balance from point_balances where discord_user_id = p_discord_user_id;
    return next;
  end if;

  if p_message_length < v_cfg.reward_min_message_length then
    granted_points := 0;
    select balance into new_balance from point_balances where discord_user_id = p_discord_user_id;
    return next;
  end if;

  v_bucket_start := to_timestamp(floor(extract(epoch from p_message_ts) / v_cfg.reward_interval_seconds) * v_cfg.reward_interval_seconds);
  v_key := 'chat:' || p_discord_user_id || ':' || p_channel_id || ':' || extract(epoch from v_bucket_start)::bigint::text;

  if v_cfg.reward_daily_cap_points is not null then
    select coalesce(sum(amount), 0) into v_daily_sum
    from point_events
    where discord_user_id = p_discord_user_id
      and kind = 'chat_grant'
      and created_at >= date_trunc('day', p_message_ts);

    if v_daily_sum >= v_cfg.reward_daily_cap_points then
      granted_points := 0;
      select balance into new_balance from point_balances where discord_user_id = p_discord_user_id;
      return next;
    end if;
  end if;

  insert into point_events(discord_user_id, kind, amount, idempotency_key, meta)
  values (
    p_discord_user_id,
    'chat_grant',
    v_cfg.reward_points_per_interval,
    v_key,
    jsonb_build_object('channel_id', p_channel_id, 'message_id', p_message_id, 'bucket_start', v_bucket_start)
  )
  on conflict (idempotency_key) do nothing;

  if found then
    update point_balances
      set balance = balance + v_cfg.reward_points_per_interval,
          updated_at = now()
    where discord_user_id = p_discord_user_id;
    granted_points := v_cfg.reward_points_per_interval;
  else
    granted_points := 0;
  end if;

  select balance into new_balance from point_balances where discord_user_id = p_discord_user_id;
  return next;
end;
$$;

create table if not exists nyang.music_control_jobs (
  job_id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  requested_by text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists music_control_jobs_status_idx on nyang.music_control_jobs (status, created_at desc);

create table if not exists nyang.music_control_logs (
  log_id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  action text not null,
  status text not null,
  message text,
  payload jsonb not null default '{}'::jsonb,
  requested_by text,
  created_at timestamptz not null default now()
);

create index if not exists music_control_logs_time_idx on nyang.music_control_logs (created_at desc);

create table if not exists nyang.music_state (
  guild_id text primary key,
  current_track jsonb,
  queue jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists music_state_updated_idx on nyang.music_state (updated_at desc);

-- Permissions (service role only; adjust if you want anon/authenticated access)
grant usage on schema nyang to service_role;
grant all privileges on all tables in schema nyang to service_role;
grant all privileges on all sequences in schema nyang to service_role;
grant all privileges on all functions in schema nyang to service_role;

-- Refresh PostgREST schema cache (optional)
-- notify pgrst, 'reload schema';
