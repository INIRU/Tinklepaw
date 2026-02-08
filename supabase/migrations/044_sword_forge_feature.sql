create table if not exists nyang.sword_forge_state (
  discord_user_id text primary key references nyang.users(discord_user_id) on delete cascade,
  level integer not null default 0 check (level >= 0 and level <= 30),
  enhance_attempts integer not null default 0,
  success_count integer not null default 0,
  sold_count integer not null default 0,
  last_enhanced_at timestamptz,
  last_sold_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function nyang.get_sword_forge_status(
  p_discord_user_id text
)
returns table (
  out_level integer,
  out_enhance_cost integer,
  out_sell_price integer,
  out_success_rate_pct double precision,
  out_balance integer,
  out_enhance_attempts integer,
  out_success_count integer,
  out_sold_count integer
)
language plpgsql
set search_path = nyang, public
as $$
declare
  v_balance integer;
  v_state nyang.sword_forge_state%rowtype;
begin
  perform ensure_user(p_discord_user_id);

  select balance
  into v_balance
  from point_balances
  where discord_user_id = p_discord_user_id;

  if v_balance is null then
    insert into point_balances(discord_user_id, balance)
    values (p_discord_user_id, 0)
    returning balance into v_balance;
  end if;

  insert into sword_forge_state(discord_user_id)
  values (p_discord_user_id)
  on conflict (discord_user_id) do nothing;

  select *
  into v_state
  from sword_forge_state
  where discord_user_id = p_discord_user_id;

  out_level := v_state.level;
  out_enhance_cost := 300 + (v_state.level * 140) + (v_state.level * v_state.level * 12);
  out_sell_price := case
    when v_state.level <= 0 then 0
    else 250 + (v_state.level * 275) + (v_state.level * v_state.level * 44)
  end;
  out_success_rate_pct := greatest(30.0, least(95.0, 94.0 - (v_state.level * 4.8)));
  out_balance := v_balance;
  out_enhance_attempts := v_state.enhance_attempts;
  out_success_count := v_state.success_count;
  out_sold_count := v_state.sold_count;
  return next;
end;
$$;

create or replace function nyang.enhance_sword(
  p_discord_user_id text
)
returns table (
  out_success boolean,
  out_error_code text,
  out_previous_level integer,
  out_new_level integer,
  out_cost integer,
  out_result text,
  out_success_rate_pct double precision,
  out_sell_price integer,
  out_new_balance integer,
  out_enhance_attempts integer,
  out_success_count integer
)
language plpgsql
set search_path = nyang, public
as $$
declare
  v_balance integer;
  v_state nyang.sword_forge_state%rowtype;
  v_previous_level integer;
  v_cost integer;
  v_roll double precision;
  v_fail_roll double precision := 0;
  v_success_rate_pct double precision;
  v_result text := 'downgrade';
  v_new_level integer;
  v_success_delta integer := 0;
begin
  perform ensure_user(p_discord_user_id);

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

  insert into sword_forge_state(discord_user_id)
  values (p_discord_user_id)
  on conflict (discord_user_id) do nothing;

  select *
  into v_state
  from sword_forge_state
  where discord_user_id = p_discord_user_id
  for update;

  v_cost := 300 + (v_state.level * 140) + (v_state.level * v_state.level * 12);
  v_success_rate_pct := greatest(30.0, least(95.0, 94.0 - (v_state.level * 4.8)));
  v_previous_level := v_state.level;

  if v_balance < v_cost then
    out_success := false;
    out_error_code := 'INSUFFICIENT_POINTS';
    out_previous_level := v_previous_level;
    out_new_level := v_previous_level;
    out_cost := v_cost;
    out_result := 'none';
    out_success_rate_pct := v_success_rate_pct;
    out_sell_price := case
      when v_state.level <= 0 then 0
      else 250 + (v_state.level * 275) + (v_state.level * v_state.level * 44)
    end;
    out_new_balance := v_balance;
    out_enhance_attempts := v_state.enhance_attempts;
    out_success_count := v_state.success_count;
    return next;
    return;
  end if;

  update point_balances
  set
    balance = balance - v_cost,
    updated_at = now()
  where discord_user_id = p_discord_user_id;

  v_balance := v_balance - v_cost;

  insert into point_events(discord_user_id, kind, amount, meta)
  values (
    p_discord_user_id,
    'sword_enhance_spend',
    -v_cost,
    jsonb_build_object(
      'previous_level', v_state.level,
      'cost', v_cost,
      'success_rate_pct', v_success_rate_pct
    )
  );

  v_roll := random() * 100.0;
  v_new_level := v_state.level;

  if v_roll < v_success_rate_pct then
    v_result := 'success';
    v_new_level := least(30, v_state.level + 1);
    v_success_delta := 1;
  else
    v_fail_roll := random() * 100.0;
    if v_state.level >= 12 and v_fail_roll < least(45.0, 18.0 + ((v_state.level - 12) * 3.0)) then
      v_result := 'destroy';
      v_new_level := 0;
    else
      v_result := 'downgrade';
      v_new_level := greatest(0, v_state.level - 1);
    end if;
  end if;

  update sword_forge_state
  set
    level = v_new_level,
    enhance_attempts = enhance_attempts + 1,
    success_count = success_count + v_success_delta,
    last_enhanced_at = now(),
    updated_at = now()
  where discord_user_id = p_discord_user_id;

  insert into point_events(discord_user_id, kind, amount, meta)
  values (
    p_discord_user_id,
    'sword_enhance_result',
    0,
    jsonb_build_object(
      'previous_level', v_state.level,
      'new_level', v_new_level,
      'result', v_result,
      'roll', v_roll,
      'fail_roll', case when v_result = 'success' then null else v_fail_roll end,
      'success_rate_pct', v_success_rate_pct
    )
  );

  select *
  into v_state
  from sword_forge_state
  where discord_user_id = p_discord_user_id;

  out_success := true;
  out_error_code := null;
  out_previous_level := v_previous_level;
  out_new_level := v_state.level;
  out_cost := v_cost;
  out_result := v_result;
  out_success_rate_pct := v_success_rate_pct;
  out_sell_price := case
    when v_state.level <= 0 then 0
    else 250 + (v_state.level * 275) + (v_state.level * v_state.level * 44)
  end;
  out_new_balance := v_balance;
  out_enhance_attempts := v_state.enhance_attempts;
  out_success_count := v_state.success_count;
  return next;
end;
$$;

create or replace function nyang.sell_sword(
  p_discord_user_id text
)
returns table (
  out_success boolean,
  out_error_code text,
  out_sold_level integer,
  out_payout integer,
  out_new_balance integer,
  out_reset_level integer,
  out_next_enhance_cost integer,
  out_sell_count integer
)
language plpgsql
set search_path = nyang, public
as $$
declare
  v_balance integer;
  v_state nyang.sword_forge_state%rowtype;
  v_sold_level integer;
  v_payout integer;
begin
  perform ensure_user(p_discord_user_id);

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

  insert into sword_forge_state(discord_user_id)
  values (p_discord_user_id)
  on conflict (discord_user_id) do nothing;

  select *
  into v_state
  from sword_forge_state
  where discord_user_id = p_discord_user_id
  for update;

  if v_state.level <= 0 then
    out_success := false;
    out_error_code := 'NOTHING_TO_SELL';
    out_sold_level := 0;
    out_payout := 0;
    out_new_balance := v_balance;
    out_reset_level := v_state.level;
    out_next_enhance_cost := 300;
    out_sell_count := v_state.sold_count;
    return next;
    return;
  end if;

  v_sold_level := v_state.level;
  v_payout := 250 + (v_state.level * 275) + (v_state.level * v_state.level * 44);

  update point_balances
  set
    balance = balance + v_payout,
    updated_at = now()
  where discord_user_id = p_discord_user_id;

  v_balance := v_balance + v_payout;

  update sword_forge_state
  set
    level = 0,
    sold_count = sold_count + 1,
    last_sold_at = now(),
    updated_at = now()
  where discord_user_id = p_discord_user_id;

  insert into point_events(discord_user_id, kind, amount, meta)
  values (
    p_discord_user_id,
    'sword_sell_reward',
    v_payout,
    jsonb_build_object(
      'sold_level', v_state.level,
      'payout', v_payout
    )
  );

  select *
  into v_state
  from sword_forge_state
  where discord_user_id = p_discord_user_id;

  out_success := true;
  out_error_code := null;
  out_sold_level := v_sold_level;
  out_payout := v_payout;
  out_new_balance := v_balance;
  out_reset_level := 0;
  out_next_enhance_cost := 300;
  out_sell_count := v_state.sold_count;
  return next;
end;
$$;
