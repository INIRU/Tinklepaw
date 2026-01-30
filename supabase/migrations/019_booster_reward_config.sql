alter table nyang.app_config
  add column if not exists booster_chat_bonus_points integer not null default 0,
  add column if not exists booster_voice_bonus_points integer not null default 0;

drop function if exists nyang.grant_chat_points(text, text, integer, timestamptz, text);
drop function if exists nyang.grant_voice_points(text, text, timestamptz);

create or replace function nyang.grant_chat_points(
  p_discord_user_id text,
  p_channel_id text,
  p_message_length integer,
  p_message_ts timestamptz,
  p_message_id text default null,
  p_is_booster boolean default false
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
  v_bonus integer := 0;
  v_grant integer := 0;
  v_remaining integer;
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

  v_bonus := case when p_is_booster then v_cfg.booster_chat_bonus_points else 0 end;
  v_grant := greatest(v_cfg.reward_points_per_interval + v_bonus, 0);

  if v_grant = 0 then
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

    v_remaining := v_cfg.reward_daily_cap_points - v_daily_sum;
    v_grant := least(v_grant, v_remaining);
  end if;

  if v_grant <= 0 then
    granted_points := 0;
    select balance into new_balance from point_balances where discord_user_id = p_discord_user_id;
    return next;
  end if;

  insert into point_events(discord_user_id, kind, amount, idempotency_key, meta)
  values (
    p_discord_user_id,
    'chat_grant',
    v_grant,
    v_key,
    jsonb_build_object('channel_id', p_channel_id, 'message_id', p_message_id, 'bucket_start', v_bucket_start, 'booster', p_is_booster)
  )
  on conflict (idempotency_key) do nothing;

  if found then
    update point_balances
      set balance = balance + v_grant,
          updated_at = now()
    where discord_user_id = p_discord_user_id;
    granted_points := v_grant;
  else
    granted_points := 0;
  end if;

  select balance into new_balance from point_balances where discord_user_id = p_discord_user_id;
  return next;
end;
$$;

create or replace function nyang.grant_voice_points(
  p_discord_user_id text,
  p_channel_id text,
  p_voice_ts timestamptz,
  p_is_booster boolean default false
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
  v_bonus integer := 0;
  v_grant integer := 0;
  v_remaining integer;
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

  v_bonus := case when p_is_booster then v_cfg.booster_voice_bonus_points else 0 end;
  v_grant := greatest(v_cfg.voice_reward_points_per_interval + v_bonus, 0);

  if v_grant = 0 then
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

    v_remaining := v_cfg.voice_reward_daily_cap_points - v_daily_sum;
    v_grant := least(v_grant, v_remaining);
  end if;

  if v_grant <= 0 then
    granted_points := 0;
    select balance into new_balance from point_balances where discord_user_id = p_discord_user_id;
    return next;
  end if;

  insert into point_events(discord_user_id, kind, amount, idempotency_key, meta)
  values (
    p_discord_user_id,
    'voice_grant',
    v_grant,
    v_key,
    jsonb_build_object('channel_id', p_channel_id, 'bucket_start', v_bucket_start, 'booster', p_is_booster)
  )
  on conflict (idempotency_key) do nothing;

  if found then
    update point_balances
      set balance = balance + v_grant,
          updated_at = now()
    where discord_user_id = p_discord_user_id;
    granted_points := v_grant;
  else
    granted_points := 0;
  end if;

  select balance into new_balance from point_balances where discord_user_id = p_discord_user_id;
  return next;
end;
$$;
