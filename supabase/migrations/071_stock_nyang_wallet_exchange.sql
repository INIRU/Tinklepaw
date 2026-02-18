create table if not exists nyang.stock_nyang_balances (
  discord_user_id text primary key references nyang.users(discord_user_id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists nyang.stock_nyang_events (
  id bigint generated always as identity primary key,
  discord_user_id text not null references nyang.users(discord_user_id) on delete cascade,
  kind text not null,
  amount integer not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists stock_nyang_events_user_created_idx
  on nyang.stock_nyang_events(discord_user_id, created_at desc);

create index if not exists stock_nyang_events_created_desc_idx
  on nyang.stock_nyang_events(created_at desc);

create temporary table stock_wallet_migration_targets on commit drop as
select
  discord_user_id,
  greatest(least(coalesce(sum(amount), 0)::bigint, 2147483647), 0)::integer as profit_points
from nyang.point_events
where kind in ('stock_buy_spend', 'stock_sell_gain')
group by discord_user_id
having greatest(least(coalesce(sum(amount), 0)::bigint, 2147483647), 0) > 0;

insert into nyang.point_balances(discord_user_id, balance)
select discord_user_id, 0
from stock_wallet_migration_targets
on conflict (discord_user_id) do nothing;

insert into nyang.stock_nyang_balances(discord_user_id, balance)
select discord_user_id, 0
from stock_wallet_migration_targets
on conflict (discord_user_id) do nothing;

update nyang.point_balances pb
set
  balance = pb.balance - mt.profit_points,
  updated_at = now()
from stock_wallet_migration_targets mt
where pb.discord_user_id = mt.discord_user_id;

update nyang.stock_nyang_balances snb
set
  balance = snb.balance + mt.profit_points,
  updated_at = now()
from stock_wallet_migration_targets mt
where snb.discord_user_id = mt.discord_user_id;

insert into nyang.point_events(discord_user_id, kind, amount, meta)
select
  mt.discord_user_id,
  'stock_migration_profit_to_nyang',
  -mt.profit_points,
  jsonb_build_object(
    'source', 'stock_wallet_split_migration_v2',
    'converted_profit_points', mt.profit_points
  )
from stock_wallet_migration_targets mt
where mt.profit_points > 0;

insert into nyang.stock_nyang_events(discord_user_id, kind, amount, meta)
select
  mt.discord_user_id,
  'stock_migration_in_v2',
  mt.profit_points,
  jsonb_build_object(
    'source', 'stock_wallet_split_migration_v2',
    'from', 'stock_net_profit',
    'nyang', mt.profit_points
  )
from stock_wallet_migration_targets mt
where mt.profit_points > 0;

drop function if exists nyang.exchange_points_to_nyang(text, integer);

create or replace function nyang.exchange_points_to_nyang(
  p_discord_user_id text,
  p_points integer
)
returns table (
  out_success boolean,
  out_error_code text,
  out_points_spent integer,
  out_nyang_received integer,
  out_new_point_balance integer,
  out_new_nyang_balance integer
)
language plpgsql
set search_path = nyang, public
as $$
declare
  v_points integer := greatest(coalesce(p_points, 0), 0);
  v_point_balance integer := 0;
  v_nyang_balance integer := 0;
begin
  out_success := false;
  out_error_code := null;
  out_points_spent := 0;
  out_nyang_received := 0;
  out_new_point_balance := 0;
  out_new_nyang_balance := 0;

  if p_points is null or p_points <= 0 then
    out_error_code := 'INVALID_POINTS';
    return next;
    return;
  end if;

  if p_points > 1000000000 then
    out_error_code := 'POINTS_TOO_LARGE';
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

  if v_point_balance < v_points then
    out_error_code := 'INSUFFICIENT_POINTS';
    out_new_point_balance := v_point_balance;
    out_new_nyang_balance := v_nyang_balance;
    return next;
    return;
  end if;

  update nyang.point_balances
  set
    balance = balance - v_points,
    updated_at = now()
  where discord_user_id = p_discord_user_id;

  update nyang.stock_nyang_balances
  set
    balance = balance + v_points,
    updated_at = now()
  where discord_user_id = p_discord_user_id;

  insert into nyang.point_events(discord_user_id, kind, amount, meta)
  values (
    p_discord_user_id,
    'stock_exchange_spend',
    -v_points,
    jsonb_build_object(
      'to', 'stock_nyang',
      'points', v_points,
      'nyang', v_points
    )
  );

  insert into nyang.stock_nyang_events(discord_user_id, kind, amount, meta)
  values (
    p_discord_user_id,
    'stock_exchange_in',
    v_points,
    jsonb_build_object(
      'from', 'points',
      'points', v_points,
      'nyang', v_points
    )
  );

  v_point_balance := v_point_balance - v_points;
  v_nyang_balance := v_nyang_balance + v_points;

  out_success := true;
  out_points_spent := v_points;
  out_nyang_received := v_points;
  out_new_point_balance := v_point_balance;
  out_new_nyang_balance := v_nyang_balance;
  return next;
end;
$$;

grant execute on function nyang.exchange_points_to_nyang(text, integer) to service_role;

drop function if exists nyang.get_stock_dashboard(text);

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
  out_point_balance integer,
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
  v_nyang_balance integer := 0;
  v_point_balance integer := 0;
  v_prev_close integer := null;
begin
  perform nyang.ensure_user(p_discord_user_id);
  perform nyang.sync_stock_market(now());

  insert into nyang.point_balances(discord_user_id, balance)
  values (p_discord_user_id, 0)
  on conflict (discord_user_id) do nothing;

  insert into nyang.stock_nyang_balances(discord_user_id, balance)
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
  into v_nyang_balance
  from nyang.stock_nyang_balances
  where discord_user_id = p_discord_user_id;

  select balance
  into v_point_balance
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
  out_balance := coalesce(v_nyang_balance, 0);
  out_point_balance := coalesce(v_point_balance, 0);
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

grant execute on function nyang.get_stock_dashboard(text) to service_role;

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
  v_nyang_balance integer := 0;
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

  insert into nyang.stock_nyang_balances(discord_user_id, balance)
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
  into v_nyang_balance
  from nyang.stock_nyang_balances
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
    if v_nyang_balance < v_settlement then
      out_error_code := 'INSUFFICIENT_NYANG';
      out_price := v_exec_price;
      out_new_balance := v_nyang_balance;
      out_holding_qty := v_holding.qty;
      out_holding_avg_price := v_holding.avg_price;
      out_unrealized_pnl := (v_pre_price - v_holding.avg_price) * v_holding.qty;
      out_gross := v_gross;
      out_fee := v_fee;
      out_settlement := v_settlement;
      return next;
      return;
    end if;

    update nyang.stock_nyang_balances
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

    v_nyang_balance := v_nyang_balance - v_settlement;
  else
    if v_holding.qty < p_qty then
      out_error_code := 'INSUFFICIENT_HOLDINGS';
      out_price := v_exec_price;
      out_new_balance := v_nyang_balance;
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

    update nyang.stock_nyang_balances
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

    v_nyang_balance := v_nyang_balance + v_settlement;
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
    insert into nyang.stock_nyang_events(discord_user_id, kind, amount, meta)
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
    insert into nyang.stock_nyang_events(discord_user_id, kind, amount, meta)
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
  out_new_balance := v_nyang_balance;
  out_holding_qty := v_new_holding_qty;
  out_holding_avg_price := v_new_avg_price;
  out_unrealized_pnl := (v_new_price - v_new_avg_price) * v_new_holding_qty;
  return next;
end;
$$;

grant execute on function nyang.trade_stock(text, text, integer) to service_role;
