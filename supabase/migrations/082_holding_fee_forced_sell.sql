-- Modify apply_daily_stock_holding_fee:
--   1. When balance < fee, force-sell enough shares at mark price to cover the deficit
--   2. Record forced sell as a separate point_event (stock_holding_fee_forced_sell)
--   3. Include forced_sell_qty / forced_sell_proceeds in the fee event metadata

create or replace function nyang.apply_daily_stock_holding_fee(p_now timestamptz default now())
returns table(
  out_applied boolean,
  out_fee_date date,
  out_charged_users integer,
  out_total_fee bigint
)
language plpgsql
security definer
set search_path = nyang, public
as $$
declare
  v_cfg nyang.app_config%rowtype;
  v_market nyang.stock_market%rowtype;
  v_tz text;
  v_fee_date date;
  v_fee_bps integer;
  v_fee_cap_bps integer;
  v_charged_users integer := 0;
  v_total_fee bigint := 0;
  v_row record;
  v_balance_before integer;
  v_balance_after integer;
  v_holding_value bigint;
  v_fee_raw bigint;
  v_fee_cap bigint;
  v_fee_amount integer;
  v_actual_fee integer;
  -- forced-sell locals
  v_forced_sell_qty integer;
  v_forced_sell_proceeds bigint;
  v_deficit bigint;
begin
  perform nyang.sync_stock_market(p_now);

  select *
  into v_cfg
  from nyang.app_config
  where id = 1
  for update;

  v_tz := coalesce(nullif(v_cfg.stock_holding_fee_timezone, ''), 'Asia/Seoul');
  v_fee_date := (p_now at time zone v_tz)::date;

  if not coalesce(v_cfg.stock_holding_fee_enabled, true) then
    return query select false, v_fee_date, 0, 0::bigint;
    return;
  end if;

  if v_cfg.stock_holding_fee_last_applied_on is not null
     and v_cfg.stock_holding_fee_last_applied_on >= v_fee_date then
    return query select false, v_fee_date, 0, 0::bigint;
    return;
  end if;

  v_fee_bps     := greatest(1, least(1000, coalesce(v_cfg.stock_holding_fee_daily_bps, 8)));
  v_fee_cap_bps := greatest(v_fee_bps, least(2000, coalesce(v_cfg.stock_holding_fee_daily_cap_bps, 20)));

  select *
  into v_market
  from nyang.stock_market
  where id = 1
  for update;

  for v_row in
    select sh.discord_user_id, sh.qty::bigint as qty
    from nyang.stock_holdings sh
    where sh.qty > 0
  loop
    insert into nyang.point_balances (discord_user_id, balance)
    values (v_row.discord_user_id, 0)
    on conflict (discord_user_id) do nothing;

    select pb.balance
    into v_balance_before
    from nyang.point_balances pb
    where pb.discord_user_id = v_row.discord_user_id
    for update;

    v_holding_value := v_row.qty * v_market.current_price::bigint;
    v_fee_raw    := floor(v_holding_value::numeric * (v_fee_bps::numeric     / 10000.0))::bigint;
    v_fee_cap    := floor(v_holding_value::numeric * (v_fee_cap_bps::numeric / 10000.0))::bigint;
    v_fee_amount := greatest(1, least(v_fee_raw, v_fee_cap))::integer;

    v_forced_sell_qty      := 0;
    v_forced_sell_proceeds := 0;

    -- If balance is insufficient, force-sell shares at mark price to cover the deficit
    if v_balance_before < v_fee_amount then
      v_deficit := v_fee_amount - v_balance_before;

      -- Sell just enough shares to cover; can never exceed current holdings
      v_forced_sell_qty := least(
        ceil(v_deficit::numeric / greatest(1, v_market.current_price)::numeric)::integer,
        v_row.qty::integer
      );

      if v_forced_sell_qty > 0 then
        v_forced_sell_proceeds := v_forced_sell_qty::bigint * v_market.current_price::bigint;

        -- Update holdings (clear avg_price when fully liquidated)
        update nyang.stock_holdings
        set qty       = qty - v_forced_sell_qty,
            avg_price = case when qty - v_forced_sell_qty = 0 then 0 else avg_price end,
            updated_at = now()
        where discord_user_id = v_row.discord_user_id;

        -- Credit proceeds to balance
        update nyang.point_balances
        set balance = balance + v_forced_sell_proceeds::integer
        where discord_user_id = v_row.discord_user_id;

        insert into nyang.point_events (discord_user_id, kind, amount, meta)
        values (
          v_row.discord_user_id,
          'stock_holding_fee_forced_sell',
          v_forced_sell_proceeds::integer,
          jsonb_build_object(
            'fee_date',   v_fee_date,
            'qty_sold',   v_forced_sell_qty,
            'mark_price', v_market.current_price,
            'proceeds',   v_forced_sell_proceeds
          )
        );

        -- Re-read updated balance (lock already held)
        select pb.balance
        into v_balance_before
        from nyang.point_balances pb
        where pb.discord_user_id = v_row.discord_user_id;
      end if;
    end if;

    v_actual_fee := least(v_balance_before, v_fee_amount);

    if v_actual_fee <= 0 then
      continue;
    end if;

    v_balance_after := v_balance_before - v_actual_fee;

    update nyang.point_balances
    set balance = v_balance_after
    where discord_user_id = v_row.discord_user_id;

    insert into nyang.point_events (discord_user_id, kind, amount, meta)
    values (
      v_row.discord_user_id,
      'stock_holding_fee',
      -v_actual_fee,
      jsonb_build_object(
        'fee_date',      v_fee_date,
        'holding_qty',   v_row.qty,
        'mark_price',    v_market.current_price,
        'holding_value', v_holding_value,
        'fee_bps',       v_fee_bps,
        'fee_cap_bps',   v_fee_cap_bps,
        'fee_requested', v_fee_amount,
        'fee_charged',   v_actual_fee
      )
    );

    insert into nyang.stock_holding_fee_events (
      fee_date,
      discord_user_id,
      holding_qty,
      mark_price,
      holding_value,
      fee_bps,
      fee_amount,
      balance_after,
      metadata
    )
    values (
      v_fee_date,
      v_row.discord_user_id,
      v_row.qty,
      v_market.current_price,
      v_holding_value,
      v_fee_bps,
      v_actual_fee,
      v_balance_after,
      jsonb_build_object(
        'fee_cap_bps',           v_fee_cap_bps,
        'fee_requested',         v_fee_amount,
        'timezone',              v_tz,
        'forced_sell_qty',       v_forced_sell_qty,
        'forced_sell_proceeds',  v_forced_sell_proceeds
      )
    );

    v_charged_users := v_charged_users + 1;
    v_total_fee     := v_total_fee + v_actual_fee;
  end loop;

  update nyang.app_config
  set stock_holding_fee_last_applied_on = v_fee_date
  where id = 1;

  return query select true, v_fee_date, v_charged_users, v_total_fee;
end
$$;

grant execute on function nyang.apply_daily_stock_holding_fee(timestamptz) to service_role;
