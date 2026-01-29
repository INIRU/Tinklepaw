-- Chat activity rewards (time bucketed, channel whitelist, optional daily cap)

create or replace function grant_chat_points(
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
