create or replace function nyang.claim_daily_chest(
  p_discord_user_id text
)
returns table (
  out_already_claimed boolean,
  out_reward_points integer,
  out_reward_item_id uuid,
  out_reward_item_name text,
  out_reward_item_rarity nyang.gacha_rarity,
  out_reward_tier text,
  out_new_balance integer,
  out_next_available_at timestamptz
)
language plpgsql
set search_path = nyang, public
as $$
declare
  v_now_kst timestamp without time zone := (now() at time zone 'Asia/Seoul');
  v_today_kst date := (now() at time zone 'Asia/Seoul')::date;
  v_next_available_kst timestamp without time zone := date_trunc('day', v_now_kst) + interval '1 day';
  v_balance integer;
  v_roll double precision;
  v_points integer;
  v_tier text;

  v_cfg nyang.app_config%rowtype;
  v_legendary_rate_pct double precision := 3;
  v_epic_rate_pct double precision := 15;
  v_rare_rate_pct double precision := 30;

  v_common_min integer := 40;
  v_common_max integer := 110;
  v_rare_min integer := 90;
  v_rare_max integer := 200;
  v_epic_min integer := 180;
  v_epic_max integer := 360;
  v_legendary_min integer := 340;
  v_legendary_max integer := 620;

  v_streak integer := 0;
  v_last_claim_date date := null;
  v_streak_after_claim integer := 0;
  v_streak_bonus_per_day_pct double precision := 0.4;
  v_streak_bonus_cap_pct double precision := 12.0;
  v_streak_bonus_rate_pct double precision := 0.0;
  v_effective_legendary_rate_pct double precision := 3;
begin
  perform ensure_user(p_discord_user_id);

  select *
  into v_cfg
  from app_config
  where id = 1;

  if found then
    v_legendary_rate_pct := greatest(0.0, least(100.0, coalesce(v_cfg.daily_chest_legendary_rate_pct, 3)));
    v_epic_rate_pct := greatest(
      0.0,
      least(100.0 - v_legendary_rate_pct, coalesce(v_cfg.daily_chest_epic_rate_pct, 15))
    );
    v_rare_rate_pct := greatest(
      0.0,
      least(100.0 - v_legendary_rate_pct - v_epic_rate_pct, coalesce(v_cfg.daily_chest_rare_rate_pct, 30))
    );

    v_common_min := greatest(0, coalesce(v_cfg.daily_chest_common_min_points, 40));
    v_common_max := greatest(v_common_min, coalesce(v_cfg.daily_chest_common_max_points, 110));
    v_rare_min := greatest(0, coalesce(v_cfg.daily_chest_rare_min_points, 90));
    v_rare_max := greatest(v_rare_min, coalesce(v_cfg.daily_chest_rare_max_points, 200));
    v_epic_min := greatest(0, coalesce(v_cfg.daily_chest_epic_min_points, 180));
    v_epic_max := greatest(v_epic_min, coalesce(v_cfg.daily_chest_epic_max_points, 360));
    v_legendary_min := greatest(0, coalesce(v_cfg.daily_chest_legendary_min_points, 340));
    v_legendary_max := greatest(v_legendary_min, coalesce(v_cfg.daily_chest_legendary_max_points, 620));
  end if;

  select balance, daily_chest_streak, daily_chest_last_claim_date
  into v_balance, v_streak, v_last_claim_date
  from point_balances
  where discord_user_id = p_discord_user_id
  for update;

  if v_balance is null then
    insert into point_balances(discord_user_id, balance, daily_chest_streak, daily_chest_last_claim_date)
    values (p_discord_user_id, 0, 0, null)
    returning balance, daily_chest_streak, daily_chest_last_claim_date
    into v_balance, v_streak, v_last_claim_date;
  end if;

  if exists (
    select 1
    from point_events
    where
      discord_user_id = p_discord_user_id
      and kind = 'daily_chest_claim'
      and (created_at at time zone 'Asia/Seoul')::date = v_today_kst
  ) then
    out_already_claimed := true;
    out_reward_points := 0;
    out_reward_item_id := null;
    out_reward_item_name := null;
    out_reward_item_rarity := null;
    out_reward_tier := 'none';
    out_new_balance := v_balance;
    out_next_available_at := (v_next_available_kst at time zone 'Asia/Seoul');
    return next;
    return;
  end if;

  if v_last_claim_date = (v_today_kst - 1) then
    v_streak := greatest(0, coalesce(v_streak, 0)) + 1;
  else
    v_streak := 1;
  end if;

  v_streak_bonus_rate_pct := least(
    v_streak_bonus_cap_pct,
    greatest(0.0, (v_streak - 1) * v_streak_bonus_per_day_pct)
  );

  v_effective_legendary_rate_pct := greatest(
    0.0,
    least(100.0 - v_epic_rate_pct - v_rare_rate_pct, v_legendary_rate_pct + v_streak_bonus_rate_pct)
  );

  v_roll := random() * 100.0;
  if v_roll < v_effective_legendary_rate_pct then
    v_tier := 'legendary';
    v_points := v_legendary_min + floor(random() * (v_legendary_max - v_legendary_min + 1))::integer;
  elseif v_roll < (v_effective_legendary_rate_pct + v_epic_rate_pct) then
    v_tier := 'epic';
    v_points := v_epic_min + floor(random() * (v_epic_max - v_epic_min + 1))::integer;
  elseif v_roll < (v_effective_legendary_rate_pct + v_epic_rate_pct + v_rare_rate_pct) then
    v_tier := 'rare';
    v_points := v_rare_min + floor(random() * (v_rare_max - v_rare_min + 1))::integer;
  else
    v_tier := 'common';
    v_points := v_common_min + floor(random() * (v_common_max - v_common_min + 1))::integer;
  end if;

  if v_tier = 'legendary' then
    v_streak_after_claim := 0;
  else
    v_streak_after_claim := v_streak;
  end if;

  update point_balances
  set
    balance = balance + v_points,
    updated_at = now(),
    daily_chest_streak = v_streak_after_claim,
    daily_chest_last_claim_date = v_today_kst
  where discord_user_id = p_discord_user_id;

  v_balance := v_balance + v_points;

  insert into point_events(discord_user_id, kind, amount, meta)
  values (
    p_discord_user_id,
    'daily_chest_claim',
    v_points,
    jsonb_build_object(
      'tier', v_tier,
      'item_id', null,
      'item_name', null,
      'item_rarity', null,
      'claimed_date_kst', v_today_kst::text,
      'streak_before_claim', v_streak,
      'streak_after_claim', v_streak_after_claim,
      'legendary_rate_base_pct', v_legendary_rate_pct,
      'legendary_rate_bonus_pct', v_streak_bonus_rate_pct,
      'legendary_rate_effective_pct', v_effective_legendary_rate_pct
    )
  );

  out_already_claimed := false;
  out_reward_points := v_points;
  out_reward_item_id := null;
  out_reward_item_name := null;
  out_reward_item_rarity := null;
  out_reward_tier := v_tier;
  out_new_balance := v_balance;
  out_next_available_at := (v_next_available_kst at time zone 'Asia/Seoul');
  return next;
end;
$$;
