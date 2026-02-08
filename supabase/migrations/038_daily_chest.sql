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
  v_item record;
begin
  perform ensure_user(p_discord_user_id);

  select balance into v_balance
  from point_balances
  where discord_user_id = p_discord_user_id
  for update;

  if v_balance is null then
    insert into point_balances(discord_user_id, balance)
    values (p_discord_user_id, 0)
    returning balance into v_balance;
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

  v_roll := random();
  if v_roll < 0.03 then
    v_tier := 'legendary';
    v_points := 340 + floor(random() * 281)::integer;
  elseif v_roll < 0.18 then
    v_tier := 'epic';
    v_points := 180 + floor(random() * 181)::integer;
  elseif v_roll < 0.48 then
    v_tier := 'rare';
    v_points := 90 + floor(random() * 111)::integer;
  else
    v_tier := 'common';
    v_points := 40 + floor(random() * 71)::integer;
  end if;

  update point_balances
  set
    balance = balance + v_points,
    updated_at = now()
  where discord_user_id = p_discord_user_id;

  v_balance := v_balance + v_points;

  if random() < 0.12 then
    select i.item_id, i.name, i.rarity
    into v_item
    from items i
    where
      i.is_active = true
      and i.is_equippable = true
    order by random()
    limit 1;

    if v_item.item_id is not null then
      insert into inventory(discord_user_id, item_id, qty)
      values (p_discord_user_id, v_item.item_id, 1)
      on conflict (discord_user_id, item_id)
      do update set
        qty = inventory.qty + 1,
        updated_at = now();
    end if;
  end if;

  insert into point_events(discord_user_id, kind, amount, meta)
  values (
    p_discord_user_id,
    'daily_chest_claim',
    v_points,
    jsonb_build_object(
      'tier', v_tier,
      'item_id', coalesce(v_item.item_id::text, null),
      'item_name', coalesce(v_item.name, null),
      'item_rarity', coalesce(v_item.rarity::text, null),
      'claimed_date_kst', v_today_kst::text
    )
  );

  out_already_claimed := false;
  out_reward_points := v_points;
  out_reward_item_id := v_item.item_id;
  out_reward_item_name := v_item.name;
  out_reward_item_rarity := v_item.rarity;
  out_reward_tier := v_tier;
  out_new_balance := v_balance;
  out_next_available_at := (v_next_available_kst at time zone 'Asia/Seoul');
  return next;
end;
$$;
