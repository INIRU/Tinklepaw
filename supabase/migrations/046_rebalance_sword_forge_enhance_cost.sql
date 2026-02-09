create or replace function nyang.compute_sword_enhance_cost(
  p_level integer
)
returns integer
language plpgsql
immutable
as $$
declare
  v_level integer := greatest(0, p_level);
  v_base_cost integer;
  v_extra_level integer;
begin
  v_base_cost := 300 + (v_level * 140) + (v_level * v_level * 12);

  if v_level < 7 then
    return v_base_cost;
  end if;

  v_extra_level := v_level - 6;
  return v_base_cost + (v_extra_level * 180) + (v_extra_level * v_extra_level * 26);
end;
$$;

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
  out_enhance_cost := nyang.compute_sword_enhance_cost(v_state.level);
  out_sell_price := nyang.compute_sword_sell_price(v_state.level);
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

  v_cost := nyang.compute_sword_enhance_cost(v_state.level);
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
    out_sell_price := nyang.compute_sword_sell_price(v_state.level);
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

  v_success_rate_pct := greatest(30.0, least(95.0, 94.0 - (v_state.level * 4.8)));

  out_success := true;
  out_error_code := null;
  out_previous_level := v_previous_level;
  out_new_level := v_state.level;
  out_cost := v_cost;
  out_result := v_result;
  out_success_rate_pct := v_success_rate_pct;
  out_sell_price := nyang.compute_sword_sell_price(v_state.level);
  out_new_balance := v_balance;
  out_enhance_attempts := v_state.enhance_attempts;
  out_success_count := v_state.success_count;
  return next;
end;
$$;
