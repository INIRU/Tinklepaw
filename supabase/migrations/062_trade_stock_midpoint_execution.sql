create or replace function nyang.trade_stock(
  p_discord_user_id text,
  p_side text,
  p_qty integer
)
returns table (
  out_success boolean,
  out_error_code text,
  out_side text,
  out_price integer,
  out_qty integer,
  out_gross integer,
  out_fee integer,
  out_settlement integer,
  out_new_balance integer,
  out_holding_qty bigint,
  out_holding_avg_price integer,
  out_unrealized_pnl bigint
)
language plpgsql
set search_path = nyang, public
as $$
declare
  v_market nyang.stock_market%rowtype;
  v_holding nyang.stock_holdings%rowtype;
  v_balance integer := 0;
  v_side text := lower(trim(coalesce(p_side, '')));
  v_gross integer := 0;
  v_fee integer := 0;
  v_settlement integer := 0;
  v_new_holding_qty bigint := 0;
  v_new_avg_price integer := 0;
  v_current_bucket timestamptz;
  v_impact_bps integer := 0;
  v_price_delta integer := 0;
  v_pre_price integer := 0;
  v_exec_price integer := 0;
  v_new_price integer := 0;
begin
  out_success := false;
  out_error_code := null;
  out_side := v_side;
  out_price := 0;
  out_qty := greatest(coalesce(p_qty, 0), 0);
  out_gross := 0;
  out_fee := 0;
  out_settlement := 0;
  out_new_balance := 0;
  out_holding_qty := 0;
  out_holding_avg_price := 0;
  out_unrealized_pnl := 0;

  if p_qty is null or p_qty <= 0 then
    out_error_code := 'INVALID_QTY';
    return next;
    return;
  end if;

  if p_qty > 1000000 then
    out_error_code := 'QTY_TOO_LARGE';
    return next;
    return;
  end if;

  if v_side not in ('buy', 'sell') then
    out_error_code := 'INVALID_SIDE';
    return next;
    return;
  end if;

  perform nyang.ensure_user(p_discord_user_id);
  perform nyang.sync_stock_market(now());

  insert into nyang.point_balances(discord_user_id, balance)
  values (p_discord_user_id, 0)
  on conflict (discord_user_id) do nothing;

  insert into nyang.stock_holdings(discord_user_id, qty, avg_price)
  values (p_discord_user_id, 0, 0)
  on conflict (discord_user_id) do nothing;

  select *
  into v_market
  from nyang.stock_market
  where id = 1
  for update;

  select balance
  into v_balance
  from nyang.point_balances
  where discord_user_id = p_discord_user_id
  for update;

  select *
  into v_holding
  from nyang.stock_holdings
  where discord_user_id = p_discord_user_id
  for update;

  out_side := v_side;
  out_qty := p_qty;

  v_pre_price := v_market.current_price;
  v_impact_bps := least(320, greatest(12, ceil(sqrt(p_qty::numeric) * 12)::integer));
  v_price_delta := greatest(
    1,
    round((v_pre_price::numeric * v_impact_bps::numeric) / 10000.0)::integer
  );

  if v_side = 'buy' then
    v_new_price := v_pre_price + v_price_delta;
  else
    v_new_price := greatest(50, v_pre_price - v_price_delta);
  end if;

  v_exec_price := greatest(
    1,
    round((v_pre_price::numeric + v_new_price::numeric) / 2.0)::integer
  );

  v_gross := v_exec_price * p_qty;
  v_fee := ceil((v_gross::numeric * v_market.fee_bps::numeric) / 10000.0)::integer;

  if v_side = 'buy' then
    v_settlement := v_gross + v_fee;
    if v_balance < v_settlement then
      out_error_code := 'INSUFFICIENT_POINTS';
      out_price := v_exec_price;
      out_new_balance := v_balance;
      out_holding_qty := v_holding.qty;
      out_holding_avg_price := v_holding.avg_price;
      out_unrealized_pnl := (v_pre_price - v_holding.avg_price) * v_holding.qty;
      out_gross := v_gross;
      out_fee := v_fee;
      out_settlement := v_settlement;
      return next;
      return;
    end if;

    update nyang.point_balances
    set
      balance = balance - v_settlement,
      updated_at = now()
    where discord_user_id = p_discord_user_id;

    v_new_holding_qty := v_holding.qty + p_qty;
    if v_new_holding_qty > 0 then
      v_new_avg_price := round(
        ((v_holding.qty * v_holding.avg_price)::numeric + (p_qty * v_exec_price)::numeric)
        / v_new_holding_qty::numeric
      )::integer;
    else
      v_new_avg_price := 0;
    end if;

    update nyang.stock_holdings
    set
      qty = v_new_holding_qty,
      avg_price = v_new_avg_price,
      updated_at = now()
    where discord_user_id = p_discord_user_id;

    v_balance := v_balance - v_settlement;
  else
    if v_holding.qty < p_qty then
      out_error_code := 'INSUFFICIENT_HOLDINGS';
      out_price := v_exec_price;
      out_new_balance := v_balance;
      out_holding_qty := v_holding.qty;
      out_holding_avg_price := v_holding.avg_price;
      out_unrealized_pnl := (v_pre_price - v_holding.avg_price) * v_holding.qty;
      out_gross := v_gross;
      out_fee := v_fee;
      out_settlement := 0;
      return next;
      return;
    end if;

    v_settlement := greatest(v_gross - v_fee, 0);

    update nyang.point_balances
    set
      balance = balance + v_settlement,
      updated_at = now()
    where discord_user_id = p_discord_user_id;

    v_new_holding_qty := v_holding.qty - p_qty;
    v_new_avg_price := case when v_new_holding_qty = 0 then 0 else v_holding.avg_price end;

    update nyang.stock_holdings
    set
      qty = v_new_holding_qty,
      avg_price = v_new_avg_price,
      updated_at = now()
    where discord_user_id = p_discord_user_id;

    v_balance := v_balance + v_settlement;
  end if;

  v_current_bucket := nyang.stock_bucket_start(now());

  insert into nyang.stock_candles(
    bucket_start,
    open_price,
    high_price,
    low_price,
    close_price,
    volume_buy,
    volume_sell
  )
  values (
    v_current_bucket,
    v_pre_price,
    v_pre_price,
    v_pre_price,
    v_pre_price,
    0,
    0
  )
  on conflict (bucket_start) do nothing;

  update nyang.stock_candles
  set
    high_price = greatest(high_price, v_new_price),
    low_price = least(low_price, v_new_price),
    close_price = v_new_price,
    volume_buy = volume_buy + case when v_side = 'buy' then p_qty else 0 end,
    volume_sell = volume_sell + case when v_side = 'sell' then p_qty else 0 end
  where bucket_start = v_current_bucket;

  update nyang.stock_market
  set
    current_price = v_new_price,
    updated_at = now()
  where id = 1;

  if v_side = 'buy' then
    insert into nyang.point_events(discord_user_id, kind, amount, meta)
    values (
      p_discord_user_id,
      'stock_buy_spend',
      -v_settlement,
      jsonb_build_object(
        'side', 'buy',
        'symbol', v_market.symbol,
        'qty', p_qty,
        'price', v_exec_price,
        'pre_price', v_pre_price,
        'exec_price', v_exec_price,
        'gross', v_gross,
        'fee', v_fee,
        'settlement', v_settlement,
        'impact_bps', v_impact_bps,
        'post_price', v_new_price
      )
    );
  else
    insert into nyang.point_events(discord_user_id, kind, amount, meta)
    values (
      p_discord_user_id,
      'stock_sell_gain',
      v_settlement,
      jsonb_build_object(
        'side', 'sell',
        'symbol', v_market.symbol,
        'qty', p_qty,
        'price', v_exec_price,
        'pre_price', v_pre_price,
        'exec_price', v_exec_price,
        'gross', v_gross,
        'fee', v_fee,
        'settlement', v_settlement,
        'impact_bps', v_impact_bps,
        'post_price', v_new_price
      )
    );
  end if;

  out_success := true;
  out_error_code := null;
  out_price := v_exec_price;
  out_gross := v_gross;
  out_fee := v_fee;
  out_settlement := v_settlement;
  out_new_balance := v_balance;
  out_holding_qty := v_new_holding_qty;
  out_holding_avg_price := v_new_avg_price;
  out_unrealized_pnl := (v_new_price - v_new_avg_price) * v_new_holding_qty;
  return next;
end;
$$;
