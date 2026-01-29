-- Move Nyaru objects into a dedicated schema to avoid polluting public.
-- NOTE: Postgres folds unquoted identifiers to lowercase, so this targets schema `nyang`.

create schema if not exists nyang;

-- Ensure service_role can access the schema after objects are moved.
grant usage on schema nyang to service_role;
grant all privileges on all tables in schema nyang to service_role;
grant all privileges on all sequences in schema nyang to service_role;
grant all privileges on all functions in schema nyang to service_role;

-- Enum/type
do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'role_sync_job_status'
  ) then
    execute 'alter type public.role_sync_job_status set schema nyang';
  end if;
exception
  when others then
    -- ignore (type may already be moved)
    null;
end
$$;

-- Tables
do $$
begin
  if to_regclass('public.app_config') is not null then execute 'alter table public.app_config set schema nyang'; end if;
  if to_regclass('public.reward_channels') is not null then execute 'alter table public.reward_channels set schema nyang'; end if;

  if to_regclass('public.users') is not null then execute 'alter table public.users set schema nyang'; end if;
  if to_regclass('public.point_balances') is not null then execute 'alter table public.point_balances set schema nyang'; end if;
  if to_regclass('public.point_events') is not null then execute 'alter table public.point_events set schema nyang'; end if;

  if to_regclass('public.items') is not null then execute 'alter table public.items set schema nyang'; end if;
  if to_regclass('public.gacha_pools') is not null then execute 'alter table public.gacha_pools set schema nyang'; end if;
  if to_regclass('public.gacha_pool_items') is not null then execute 'alter table public.gacha_pool_items set schema nyang'; end if;
  if to_regclass('public.gacha_user_state') is not null then execute 'alter table public.gacha_user_state set schema nyang'; end if;
  if to_regclass('public.gacha_pulls') is not null then execute 'alter table public.gacha_pulls set schema nyang'; end if;
  if to_regclass('public.gacha_pull_results') is not null then execute 'alter table public.gacha_pull_results set schema nyang'; end if;

  if to_regclass('public.inventory') is not null then execute 'alter table public.inventory set schema nyang'; end if;
  if to_regclass('public.equipped') is not null then execute 'alter table public.equipped set schema nyang'; end if;
  if to_regclass('public.role_sync_jobs') is not null then execute 'alter table public.role_sync_jobs set schema nyang'; end if;
end
$$;

-- Functions (RPC)
do $$
begin
  if to_regprocedure('public.ensure_user(text)') is not null then
    execute 'alter function public.ensure_user(text) set schema nyang';
  end if;
  if to_regprocedure('public.perform_gacha_draw(text, uuid)') is not null then
    execute 'alter function public.perform_gacha_draw(text, uuid) set schema nyang';
  end if;
  if to_regprocedure('public.set_equipped_item(text, uuid)') is not null then
    execute 'alter function public.set_equipped_item(text, uuid) set schema nyang';
  end if;
  if to_regprocedure('public.grant_chat_points(text, text, integer, timestamptz, text)') is not null then
    execute 'alter function public.grant_chat_points(text, text, integer, timestamptz, text) set schema nyang';
  end if;
end
$$;

-- Ensure functions resolve unqualified identifiers inside nyang.
do $$
begin
  if to_regprocedure('nyang.ensure_user(text)') is not null then
    execute 'alter function nyang.ensure_user(text) set search_path = nyang, public';
  end if;
  if to_regprocedure('nyang.perform_gacha_draw(text, uuid)') is not null then
    execute 'alter function nyang.perform_gacha_draw(text, uuid) set search_path = nyang, public';
  end if;
  if to_regprocedure('nyang.set_equipped_item(text, uuid)') is not null then
    execute 'alter function nyang.set_equipped_item(text, uuid) set search_path = nyang, public';
  end if;
  if to_regprocedure('nyang.grant_chat_points(text, text, integer, timestamptz, text)') is not null then
    execute 'alter function nyang.grant_chat_points(text, text, integer, timestamptz, text) set search_path = nyang, public';
  end if;
end
$$;
