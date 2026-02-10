alter table nyang.sword_forge_state
  add column if not exists total_paid_cost integer not null default 0;

update nyang.sword_forge_state s
set total_paid_cost = coalesce(
  (
    select greatest(0, coalesce(sum(case when pe.amount < 0 then -pe.amount else 0 end), 0))::integer
    from nyang.point_events pe
    where pe.discord_user_id = s.discord_user_id
      and pe.kind = 'sword_enhance_spend'
      and pe.created_at > coalesce(
        (
          select max(se.created_at)
          from nyang.point_events se
          where se.discord_user_id = s.discord_user_id
            and se.kind in ('sword_sell_reward', 'sword_forge_sell')
        ),
        '-infinity'::timestamptz
      )
  ),
  0
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
  out_tuna_forge_energy integer,
  out_enhance_attempts integer,
  out_success_count integer,
  out_sold_count integer,
  out_total_paid_cost integer
)
language plpgsql
set search_path = nyang, public
as $$
declare
  v_state nyang.sword_forge_state%rowtype;
  v_balance integer;
  v_tuna_forge_energy integer;
begin
  perform ensure_user(p_discord_user_id);

  insert into point_balances(discord_user_id, balance)
  values (p_discord_user_id, 0)
  on conflict (discord_user_id) do nothing;

  select balance, tuna_forge_energy
  into v_balance, v_tuna_forge_energy
  from point_balances
  where discord_user_id = p_discord_user_id;

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
  out_tuna_forge_energy := greatest(0, coalesce(v_tuna_forge_energy, 0));
  out_enhance_attempts := v_state.enhance_attempts;
  out_success_count := v_state.success_count;
  out_sold_count := v_state.sold_count;
  out_total_paid_cost := greatest(0, coalesce(v_state.total_paid_cost, 0));
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
  out_tuna_forge_energy integer,
  out_enhance_attempts integer,
  out_success_count integer
)
language plpgsql
set search_path = nyang, public
as $$
declare
  v_balance integer;
  v_tuna_forge_energy integer;
  v_state nyang.sword_forge_state%rowtype;
  v_previous_level integer;
  v_cost integer;
  v_effective_cost integer;
  v_roll double precision;
  v_fail_roll double precision := 0;
  v_success_rate_pct double precision;
  v_result text := 'downgrade';
  v_new_level integer;
  v_success_delta integer := 0;
  v_used_tuna_energy boolean := false;
  v_energy_spent integer := 0;
  v_total_paid_cost integer := 0;
begin
  perform ensure_user(p_discord_user_id);

  select balance, tuna_forge_energy
  into v_balance, v_tuna_forge_energy
  from point_balances
  where discord_user_id = p_discord_user_id
  for update;

  if v_balance is null then
    insert into point_balances(discord_user_id, balance, tuna_forge_energy)
    values (p_discord_user_id, 0, 0)
    returning balance, tuna_forge_energy into v_balance, v_tuna_forge_energy;
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
  v_tuna_forge_energy := greatest(0, coalesce(v_tuna_forge_energy, 0));
  v_total_paid_cost := greatest(0, coalesce(v_state.total_paid_cost, 0));

  if v_tuna_forge_energy >= 3 then
    v_used_tuna_energy := true;
    v_energy_spent := 3;
    v_effective_cost := floor(v_cost * 0.5)::integer;
  else
    v_effective_cost := v_cost;
  end if;

  if v_balance < v_effective_cost then
    out_success := false;
    out_error_code := 'INSUFFICIENT_POINTS';
    out_previous_level := v_previous_level;
    out_new_level := v_previous_level;
    out_cost := v_effective_cost;
    out_result := 'none';
    out_success_rate_pct := v_success_rate_pct;
    out_sell_price := nyang.compute_sword_sell_price(v_state.level);
    out_new_balance := v_balance;
    out_tuna_forge_energy := v_tuna_forge_energy;
    out_enhance_attempts := v_state.enhance_attempts;
    out_success_count := v_state.success_count;
    return next;
    return;
  end if;

  if v_energy_spent > 0 then
    update point_balances
    set
      balance = balance - v_effective_cost,
      tuna_forge_energy = greatest(0, tuna_forge_energy - v_energy_spent),
      updated_at = now()
    where discord_user_id = p_discord_user_id;

    v_tuna_forge_energy := v_tuna_forge_energy - v_energy_spent;

    insert into point_events(discord_user_id, kind, amount, meta)
    values (
      p_discord_user_id,
      'forge_energy_spend',
      0,
      jsonb_build_object(
        'previous_level', v_state.level,
        'energy_spent', v_energy_spent,
        'base_cost', v_cost,
        'discount_rate_pct', 50,
        'discounted_cost', v_effective_cost
      )
    );
  else
    update point_balances
    set
      balance = balance - v_effective_cost,
      updated_at = now()
    where discord_user_id = p_discord_user_id;
  end if;

  v_balance := v_balance - v_effective_cost;
  v_total_paid_cost := v_total_paid_cost + v_effective_cost;

  insert into point_events(discord_user_id, kind, amount, meta)
  values (
    p_discord_user_id,
    'sword_enhance_spend',
    -v_effective_cost,
    jsonb_build_object(
      'previous_level', v_state.level,
      'cost', v_effective_cost,
      'base_cost', v_cost,
      'success_rate_pct', v_success_rate_pct,
      'used_tuna_forge_energy', v_used_tuna_energy,
      'energy_spent', v_energy_spent,
      'discount_rate_pct', case when v_used_tuna_energy then 50 else 0 end
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
    total_paid_cost = v_total_paid_cost,
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
      'success_rate_pct', v_success_rate_pct,
      'used_tuna_forge_energy', v_used_tuna_energy,
      'energy_spent', v_energy_spent,
      'paid_cost', v_effective_cost
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
  out_cost := v_effective_cost;
  out_result := v_result;
  out_success_rate_pct := v_success_rate_pct;
  out_sell_price := nyang.compute_sword_sell_price(v_state.level);
  out_new_balance := v_balance;
  out_tuna_forge_energy := v_tuna_forge_energy;
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
  v_state nyang.sword_forge_state%rowtype;
  v_balance integer;
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
    out_sold_level := v_state.level;
    out_payout := 0;
    out_new_balance := v_balance;
    out_reset_level := v_state.level;
    out_next_enhance_cost := nyang.compute_sword_enhance_cost(v_state.level);
    out_sell_count := v_state.sold_count;
    return next;
    return;
  end if;

  v_payout := nyang.compute_sword_sell_price(v_state.level);

  update point_balances
  set
    balance = balance + v_payout,
    updated_at = now()
  where discord_user_id = p_discord_user_id;

  v_balance := v_balance + v_payout;

  update sword_forge_state
  set
    level = 0,
    total_paid_cost = 0,
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
  out_sold_level := v_state.level;
  out_payout := v_payout;
  out_new_balance := v_balance;
  out_reset_level := v_state.level;
  out_next_enhance_cost := nyang.compute_sword_enhance_cost(v_state.level);
  out_sell_count := v_state.sold_count;
  return next;
end;
$$;
