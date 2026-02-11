create or replace function nyang.get_stock_dashboard(
  p_discord_user_id text
)
returns table (
  out_symbol text,
  out_display_name text,
  out_price integer,
  out_change_pct numeric(10,2),
  out_fee_bps integer,
  out_balance integer,
  out_holding_qty bigint,
  out_holding_avg_price integer,
  out_holding_value bigint,
  out_unrealized_pnl bigint,
  out_candles jsonb
)
language plpgsql
set search_path = nyang, public
as $$
declare
  v_market nyang.stock_market%rowtype;
  v_holdings nyang.stock_holdings%rowtype;
  v_balance integer := 0;
  v_prev_close integer := null;
begin
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
  where id = 1;

  select balance
  into v_balance
  from nyang.point_balances
  where discord_user_id = p_discord_user_id;

  select *
  into v_holdings
  from nyang.stock_holdings
  where discord_user_id = p_discord_user_id;

  select close_price
  into v_prev_close
  from nyang.stock_candles
  where bucket_start < (select max(bucket_start) from nyang.stock_candles)
  order by bucket_start desc
  limit 1;

  out_symbol := v_market.symbol;
  out_display_name := v_market.display_name;
  out_price := v_market.current_price;
  out_fee_bps := v_market.fee_bps;
  out_balance := coalesce(v_balance, 0);
  out_holding_qty := coalesce(v_holdings.qty, 0);
  out_holding_avg_price := coalesce(v_holdings.avg_price, 0);
  out_holding_value := out_holding_qty * out_price;
  out_unrealized_pnl := (out_price - out_holding_avg_price) * out_holding_qty;

  if coalesce(v_prev_close, 0) > 0 then
    out_change_pct := round(((out_price - v_prev_close)::numeric / v_prev_close::numeric) * 100.0, 2);
  else
    out_change_pct := 0;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        't', c.bucket_start,
        'o', c.open_price,
        'h', c.high_price,
        'l', c.low_price,
        'c', c.close_price,
        'vb', c.volume_buy,
        'vs', c.volume_sell
      )
      order by c.bucket_start
    ),
    '[]'::jsonb
  )
  into out_candles
  from (
    select
      bucket_start,
      open_price,
      high_price,
      low_price,
      close_price,
      volume_buy,
      volume_sell
    from nyang.stock_candles
    order by bucket_start desc
    limit 72
  ) c;

  return next;
end;
$$;
