alter table nyang.app_config
  add column if not exists voice_reward_points_per_interval integer not null default 0,
  add column if not exists voice_reward_interval_seconds integer not null default 60,
  add column if not exists voice_reward_daily_cap_points integer;

create or replace function nyang.grant_voice_points(
  p_discord_user_id text,
  p_channel_id text,
  p_voice_ts timestamptz
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
  v_bucket_start timestamptz;
  v_key text;
  v_daily_sum integer;
begin
  perform ensure_user(p_discord_user_id);

  select * into v_cfg from app_config where id = 1;
  if not found then
    raise exception 'CONFIG_MISSING';
  end if;

  if v_cfg.voice_reward_points_per_interval <= 0 then
    granted_points := 0;
    select balance into new_balance from point_balances where discord_user_id = p_discord_user_id;
    return next;
  end if;

  v_bucket_start := to_timestamp(floor(extract(epoch from p_voice_ts) / v_cfg.voice_reward_interval_seconds) * v_cfg.voice_reward_interval_seconds);
  v_key := 'voice:' || p_discord_user_id || ':' || p_channel_id || ':' || extract(epoch from v_bucket_start)::bigint::text;

  if v_cfg.voice_reward_daily_cap_points is not null then
    select coalesce(sum(amount), 0) into v_daily_sum
    from point_events
    where discord_user_id = p_discord_user_id
      and kind = 'voice_grant'
      and created_at >= date_trunc('day', p_voice_ts);

    if v_daily_sum >= v_cfg.voice_reward_daily_cap_points then
      granted_points := 0;
      select balance into new_balance from point_balances where discord_user_id = p_discord_user_id;
      return next;
    end if;
  end if;

  insert into point_events(discord_user_id, kind, amount, idempotency_key, meta)
  values (
    p_discord_user_id,
    'voice_grant',
    v_cfg.voice_reward_points_per_interval,
    v_key,
    jsonb_build_object('channel_id', p_channel_id, 'bucket_start', v_bucket_start)
  )
  on conflict (idempotency_key) do nothing;

  if found then
    update point_balances
      set balance = balance + v_cfg.voice_reward_points_per_interval,
          updated_at = now()
    where discord_user_id = p_discord_user_id;
    granted_points := v_cfg.voice_reward_points_per_interval;
  else
    granted_points := 0;
  end if;

  select balance into new_balance from point_balances where discord_user_id = p_discord_user_id;
  return next;
end;
$$;
