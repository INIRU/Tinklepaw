alter table nyang.app_config
  add column if not exists lottery_jackpot_rate_pct double precision not null default 0.3,
  add column if not exists lottery_gold_rate_pct double precision not null default 1.5,
  add column if not exists lottery_silver_rate_pct double precision not null default 8,
  add column if not exists lottery_bronze_rate_pct double precision not null default 20,
  add column if not exists lottery_ticket_cooldown_seconds integer not null default 60;

drop function if exists nyang.play_lottery_ticket(text);

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
begin
  perform ensure_user(p_discord_user_id);

  select *
  into v_cfg
  from app_config
  where id = 1;

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
  end if;

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
  if v_roll < v_jackpot_rate_pct then
    v_tier := 'jackpot';
    v_payout := 20000;
  elseif v_roll < (v_jackpot_rate_pct + v_gold_rate_pct) then
    v_tier := 'gold';
    v_payout := 5000;
  elseif v_roll < (v_jackpot_rate_pct + v_gold_rate_pct + v_silver_rate_pct) then
    v_tier := 'silver';
    v_payout := 1500;
  elseif v_roll < (v_jackpot_rate_pct + v_gold_rate_pct + v_silver_rate_pct + v_bronze_rate_pct) then
    v_tier := 'bronze';
    v_payout := 700;
  else
    v_tier := 'miss';
    v_payout := 0;
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
        'jackpot_rate_pct', v_jackpot_rate_pct,
        'gold_rate_pct', v_gold_rate_pct,
        'silver_rate_pct', v_silver_rate_pct,
        'bronze_rate_pct', v_bronze_rate_pct
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
