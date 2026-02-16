alter table nyang.app_config
  add column if not exists lottery_jackpot_overflow_points integer not null default 0;

update nyang.app_config
set
  lottery_jackpot_overflow_points = greatest(0, coalesce(lottery_jackpot_overflow_points, 0))
    + greatest(0, coalesce(lottery_jackpot_pool_points, 0) - 100000),
  lottery_jackpot_pool_points = least(100000, greatest(0, coalesce(lottery_jackpot_pool_points, 0))),
  updated_at = now()
where id = 1;

create or replace function nyang.play_lottery_ticket(
  p_discord_user_id text
)
returns table (
  out_success boolean,
  out_error_code text,
  out_ticket_price integer,
  out_ticket_number integer,
  out_tier text,
  out_payout integer,
  out_net_change integer,
  out_new_balance integer,
  out_next_available_at timestamptz
)
language plpgsql
set search_path = nyang, public
as $$
declare
  v_now timestamptz := now();
  v_ticket_price integer := 500;
  v_balance integer;
  v_roll double precision;
  v_ticket_number integer := floor(random() * 1000000)::integer;
  v_tier text := 'miss';
  v_payout integer := 0;
  v_last_purchase_at timestamptz := null;
  v_next_available_at timestamptz := null;

  v_cfg nyang.app_config%rowtype;
  v_jackpot_rate_pct double precision := 0.3;
  v_gold_rate_pct double precision := 1.5;
  v_silver_rate_pct double precision := 8.0;
  v_bronze_rate_pct double precision := 20.0;
  v_cooldown_seconds integer := 60;

  v_jackpot_base_points integer := 20000;
  v_gold_payout_points integer := 5000;
  v_silver_payout_points integer := 1500;
  v_bronze_payout_points integer := 700;
  v_jackpot_pool_points integer := 0;
  v_jackpot_pool_cap_points integer := 100000;
  v_jackpot_overflow_points integer := 0;

  v_jackpot_pool_before integer := 0;
  v_jackpot_pool_awarded integer := 0;
  v_jackpot_overflow_before integer := 0;
  v_jackpot_overflow_after integer := 0;

  v_jackpot_rate_boost_pct double precision := 0.0;
  v_effective_jackpot_rate_pct double precision := 0.3;

  v_pool_after integer := 0;
  v_overflow_after integer := 0;
begin
  perform ensure_user(p_discord_user_id);

  select *
  into v_cfg
  from app_config
  where id = 1
  for update;

  if found then
    v_jackpot_rate_pct := greatest(0.0, least(100.0, coalesce(v_cfg.lottery_jackpot_rate_pct, 0.3)));
    v_gold_rate_pct := greatest(
      0.0,
      least(100.0 - v_jackpot_rate_pct, coalesce(v_cfg.lottery_gold_rate_pct, 1.5))
    );
    v_silver_rate_pct := greatest(
      0.0,
      least(100.0 - v_jackpot_rate_pct - v_gold_rate_pct, coalesce(v_cfg.lottery_silver_rate_pct, 8.0))
    );
    v_bronze_rate_pct := greatest(
      0.0,
      least(100.0 - v_jackpot_rate_pct - v_gold_rate_pct - v_silver_rate_pct, coalesce(v_cfg.lottery_bronze_rate_pct, 20.0))
    );
    v_cooldown_seconds := greatest(0, least(604800, coalesce(v_cfg.lottery_ticket_cooldown_seconds, 60)));

    v_ticket_price := greatest(1, coalesce(v_cfg.lottery_ticket_price, 500));
    v_jackpot_base_points := greatest(0, coalesce(v_cfg.lottery_jackpot_base_points, 20000));
    v_gold_payout_points := greatest(0, coalesce(v_cfg.lottery_gold_payout_points, 5000));
    v_silver_payout_points := greatest(0, coalesce(v_cfg.lottery_silver_payout_points, 1500));
    v_bronze_payout_points := greatest(0, coalesce(v_cfg.lottery_bronze_payout_points, 700));
    v_jackpot_pool_points := greatest(0, coalesce(v_cfg.lottery_jackpot_pool_points, 0));
    v_jackpot_overflow_points := greatest(0, coalesce(v_cfg.lottery_jackpot_overflow_points, 0));
  end if;

  if v_jackpot_pool_points > v_jackpot_pool_cap_points then
    v_jackpot_overflow_points := v_jackpot_overflow_points + (v_jackpot_pool_points - v_jackpot_pool_cap_points);
    v_jackpot_pool_points := v_jackpot_pool_cap_points;

    update app_config
    set
      lottery_jackpot_pool_points = v_jackpot_pool_points,
      lottery_jackpot_overflow_points = v_jackpot_overflow_points,
      updated_at = now()
    where id = 1;
  end if;

  v_jackpot_pool_before := v_jackpot_pool_points;
  v_jackpot_overflow_before := v_jackpot_overflow_points;
  v_jackpot_overflow_after := v_jackpot_overflow_points;

  v_jackpot_rate_boost_pct := least(
    2.0,
    (v_jackpot_overflow_points::double precision / 10000.0) * 0.1
  );

  v_effective_jackpot_rate_pct := greatest(
    0.0,
    least(
      100.0 - v_gold_rate_pct - v_silver_rate_pct - v_bronze_rate_pct,
      v_jackpot_rate_pct + v_jackpot_rate_boost_pct
    )
  );

  select balance
  into v_balance
  from point_balances
  where discord_user_id = p_discord_user_id
  for update;

  if v_balance is null then
    insert into point_balances(discord_user_id, balance)
    values (p_discord_user_id, 0)
    returning balance into v_balance;
  end if;

  if v_cooldown_seconds > 0 then
    select created_at
    into v_last_purchase_at
    from point_events
    where
      discord_user_id = p_discord_user_id
      and kind = 'lottery_ticket_purchase'
    order by created_at desc
    limit 1;

    if v_last_purchase_at is not null then
      v_next_available_at := v_last_purchase_at + make_interval(secs => v_cooldown_seconds);
      if v_next_available_at > v_now then
        out_success := false;
        out_error_code := 'COOLDOWN_ACTIVE';
        out_ticket_price := v_ticket_price;
        out_ticket_number := v_ticket_number;
        out_tier := 'none';
        out_payout := 0;
        out_net_change := 0;
        out_new_balance := v_balance;
        out_next_available_at := v_next_available_at;
        return next;
        return;
      end if;
    end if;
  end if;

  if v_balance < v_ticket_price then
    out_success := false;
    out_error_code := 'INSUFFICIENT_POINTS';
    out_ticket_price := v_ticket_price;
    out_ticket_number := v_ticket_number;
    out_tier := 'none';
    out_payout := 0;
    out_net_change := 0;
    out_new_balance := v_balance;
    out_next_available_at := null;
    return next;
    return;
  end if;

  update point_balances
  set
    balance = balance - v_ticket_price,
    updated_at = now()
  where discord_user_id = p_discord_user_id;

  v_balance := v_balance - v_ticket_price;

  insert into point_events(discord_user_id, kind, amount, meta)
  values (
    p_discord_user_id,
    'lottery_ticket_purchase',
    -v_ticket_price,
    jsonb_build_object(
      'ticket_number', lpad(v_ticket_number::text, 6, '0'),
      'ticket_price', v_ticket_price,
      'cooldown_seconds', v_cooldown_seconds
    )
  );

  v_roll := random() * 100.0;
  if v_roll < v_effective_jackpot_rate_pct then
    v_tier := 'jackpot';
    v_jackpot_pool_before := v_jackpot_pool_points;
    v_jackpot_pool_awarded := v_jackpot_pool_points;
    v_payout := v_jackpot_base_points + v_jackpot_pool_awarded;

    update app_config
    set
      lottery_jackpot_pool_points = 0,
      lottery_jackpot_overflow_points = 0,
      updated_at = now()
    where id = 1;

    v_jackpot_pool_points := 0;
    v_jackpot_overflow_points := 0;
    v_jackpot_overflow_after := 0;
  elseif v_roll < (v_effective_jackpot_rate_pct + v_gold_rate_pct) then
    v_tier := 'gold';
    v_payout := v_gold_payout_points;
  elseif v_roll < (v_effective_jackpot_rate_pct + v_gold_rate_pct + v_silver_rate_pct) then
    v_tier := 'silver';
    v_payout := v_silver_payout_points;
  elseif v_roll < (v_effective_jackpot_rate_pct + v_gold_rate_pct + v_silver_rate_pct + v_bronze_rate_pct) then
    v_tier := 'bronze';
    v_payout := v_bronze_payout_points;
  else
    v_tier := 'miss';
    v_payout := 0;

    v_pool_after := least(v_jackpot_pool_cap_points, v_jackpot_pool_points + v_ticket_price);
    v_overflow_after := v_jackpot_overflow_points + greatest(0, v_jackpot_pool_points + v_ticket_price - v_jackpot_pool_cap_points);

    update app_config
    set
      lottery_jackpot_pool_points = v_pool_after,
      lottery_jackpot_overflow_points = v_overflow_after,
      updated_at = now()
    where id = 1;

    v_jackpot_pool_points := v_pool_after;
    v_jackpot_overflow_points := v_overflow_after;
    v_jackpot_overflow_after := v_overflow_after;
  end if;

  if v_payout > 0 then
    update point_balances
    set
      balance = balance + v_payout,
      updated_at = now()
    where discord_user_id = p_discord_user_id;

    v_balance := v_balance + v_payout;

    insert into point_events(discord_user_id, kind, amount, meta)
    values (
      p_discord_user_id,
      'lottery_ticket_payout',
      v_payout,
      jsonb_build_object(
        'ticket_number', lpad(v_ticket_number::text, 6, '0'),
        'tier', v_tier,
        'roll', v_roll,
        'ticket_price', v_ticket_price,
        'jackpot_rate_pct', v_effective_jackpot_rate_pct,
        'jackpot_rate_base_pct', v_jackpot_rate_pct,
        'jackpot_rate_boost_pct', v_jackpot_rate_boost_pct,
        'gold_rate_pct', v_gold_rate_pct,
        'silver_rate_pct', v_silver_rate_pct,
        'bronze_rate_pct', v_bronze_rate_pct,
        'jackpot_base_points', v_jackpot_base_points,
        'jackpot_pool_cap_points', v_jackpot_pool_cap_points,
        'jackpot_pool_before', v_jackpot_pool_before,
        'jackpot_pool_awarded', v_jackpot_pool_awarded,
        'jackpot_pool_after', v_jackpot_pool_points,
        'jackpot_overflow_before', v_jackpot_overflow_before,
        'jackpot_overflow_after', v_jackpot_overflow_after
      )
    );
  end if;

  out_success := true;
  out_error_code := null;
  out_ticket_price := v_ticket_price;
  out_ticket_number := v_ticket_number;
  out_tier := v_tier;
  out_payout := v_payout;
  out_net_change := v_payout - v_ticket_price;
  out_new_balance := v_balance;
  out_next_available_at := case
    when v_cooldown_seconds > 0 then v_now + make_interval(secs => v_cooldown_seconds)
    else null
  end;
  return next;
end;
$$;

create or replace function nyang.accrue_lottery_jackpot_from_activity()
returns trigger
language plpgsql
set search_path = nyang, public
as $$
declare
  v_rate_pct numeric;
  v_delta integer;
  v_pool_cap_points integer := 100000;
  v_pool_points integer := 0;
  v_overflow_points integer := 0;
  v_pool_after integer := 0;
  v_overflow_after integer := 0;
begin
  select
    coalesce(lottery_activity_jackpot_rate_pct, 0),
    greatest(0, coalesce(lottery_jackpot_pool_points, 0)),
    greatest(0, coalesce(lottery_jackpot_overflow_points, 0))
  into
    v_rate_pct,
    v_pool_points,
    v_overflow_points
  from nyang.app_config
  where id = 1
  for update;

  if not found or v_rate_pct <= 0 then
    return new;
  end if;

  if v_pool_points > v_pool_cap_points then
    v_overflow_points := v_overflow_points + (v_pool_points - v_pool_cap_points);
    v_pool_points := v_pool_cap_points;
  end if;

  v_delta := floor(greatest(coalesce(new.amount, 0), 0)::numeric * (v_rate_pct / 100.0))::integer;

  if v_delta <= 0 then
    return new;
  end if;

  v_pool_after := least(v_pool_cap_points, v_pool_points + v_delta);
  v_overflow_after := v_overflow_points + greatest(0, v_pool_points + v_delta - v_pool_cap_points);

  update nyang.app_config
  set
    lottery_jackpot_pool_points = v_pool_after,
    lottery_jackpot_overflow_points = v_overflow_after,
    updated_at = now()
  where id = 1;

  return new;
end;
$$;
