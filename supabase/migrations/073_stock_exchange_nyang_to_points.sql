drop function if exists nyang.exchange_nyang_to_points(text, integer);

create or replace function nyang.exchange_nyang_to_points(
  p_discord_user_id text,
  p_nyang integer
)
returns table (
  out_success boolean,
  out_error_code text,
  out_nyang_spent integer,
  out_points_received integer,
  out_new_point_balance integer,
  out_new_nyang_balance integer,
  out_rate_nyang_per_point integer
)
language plpgsql
set search_path = nyang, public
as $$
declare
  v_nyang integer := greatest(coalesce(p_nyang, 0), 0);
  v_rate_nyang_per_point integer := 100;
  v_point_balance integer := 0;
  v_nyang_balance integer := 0;
  v_points_received integer := 0;
  v_nyang_spent integer := 0;
begin
  out_success := false;
  out_error_code := null;
  out_nyang_spent := 0;
  out_points_received := 0;
  out_new_point_balance := 0;
  out_new_nyang_balance := 0;
  out_rate_nyang_per_point := v_rate_nyang_per_point;

  if p_nyang is null or p_nyang <= 0 then
    out_error_code := 'INVALID_NYANG';
    return next;
    return;
  end if;

  if p_nyang > 1000000000 then
    out_error_code := 'NYANG_TOO_LARGE';
    return next;
    return;
  end if;

  perform nyang.ensure_user(p_discord_user_id);

  insert into nyang.point_balances(discord_user_id, balance)
  values (p_discord_user_id, 0)
  on conflict (discord_user_id) do nothing;

  insert into nyang.stock_nyang_balances(discord_user_id, balance)
  values (p_discord_user_id, 0)
  on conflict (discord_user_id) do nothing;

  select balance
  into v_point_balance
  from nyang.point_balances
  where discord_user_id = p_discord_user_id
  for update;

  select balance
  into v_nyang_balance
  from nyang.stock_nyang_balances
  where discord_user_id = p_discord_user_id
  for update;

  if v_nyang_balance < v_nyang then
    out_error_code := 'INSUFFICIENT_NYANG';
    out_new_point_balance := v_point_balance;
    out_new_nyang_balance := v_nyang_balance;
    return next;
    return;
  end if;

  v_points_received := floor(v_nyang::numeric / v_rate_nyang_per_point::numeric)::integer;
  if v_points_received <= 0 then
    out_error_code := 'AMOUNT_TOO_SMALL';
    out_new_point_balance := v_point_balance;
    out_new_nyang_balance := v_nyang_balance;
    return next;
    return;
  end if;

  v_nyang_spent := v_points_received * v_rate_nyang_per_point;

  update nyang.stock_nyang_balances
  set
    balance = balance - v_nyang_spent,
    updated_at = now()
  where discord_user_id = p_discord_user_id;

  update nyang.point_balances
  set
    balance = balance + v_points_received,
    updated_at = now()
  where discord_user_id = p_discord_user_id;

  insert into nyang.stock_nyang_events(discord_user_id, kind, amount, meta)
  values (
    p_discord_user_id,
    'stock_exchange_out',
    -v_nyang_spent,
    jsonb_build_object(
      'to', 'points',
      'nyang', v_nyang_spent,
      'points', v_points_received,
      'rate_nyang_per_point', v_rate_nyang_per_point
    )
  );

  insert into nyang.point_events(discord_user_id, kind, amount, meta)
  values (
    p_discord_user_id,
    'stock_exchange_gain',
    v_points_received,
    jsonb_build_object(
      'from', 'stock_nyang',
      'nyang', v_nyang_spent,
      'points', v_points_received,
      'rate_nyang_per_point', v_rate_nyang_per_point
    )
  );

  v_nyang_balance := v_nyang_balance - v_nyang_spent;
  v_point_balance := v_point_balance + v_points_received;

  out_success := true;
  out_nyang_spent := v_nyang_spent;
  out_points_received := v_points_received;
  out_new_point_balance := v_point_balance;
  out_new_nyang_balance := v_nyang_balance;
  out_rate_nyang_per_point := v_rate_nyang_per_point;
  return next;
end;
$$;

grant execute on function nyang.exchange_nyang_to_points(text, integer) to service_role;
