create table if not exists nyang.stock_market (
  id smallint primary key check (id = 1),
  symbol text not null default 'KURO',
  display_name text not null default '쿠로 주식',
  current_price integer not null default 1000 check (current_price > 0),
  fee_bps integer not null default 150 check (fee_bps >= 0 and fee_bps <= 3000),
  volatility_pct numeric(6,3) not null default 3.500 check (volatility_pct >= 0 and volatility_pct <= 30),
  drift_pct numeric(6,3) not null default 0.150 check (drift_pct >= -10 and drift_pct <= 10),
  updated_at timestamptz not null default now()
);

insert into nyang.stock_market(id)
values (1)
on conflict (id) do nothing;

create table if not exists nyang.stock_candles (
  bucket_start timestamptz primary key,
  open_price integer not null check (open_price > 0),
  high_price integer not null check (high_price > 0),
  low_price integer not null check (low_price > 0),
  close_price integer not null check (close_price > 0),
  volume_buy bigint not null default 0 check (volume_buy >= 0),
  volume_sell bigint not null default 0 check (volume_sell >= 0),
  created_at timestamptz not null default now(),
  check (high_price >= greatest(open_price, close_price)),
  check (low_price <= least(open_price, close_price))
);

create index if not exists stock_candles_bucket_desc_idx
  on nyang.stock_candles(bucket_start desc);

create table if not exists nyang.stock_holdings (
  discord_user_id text primary key
    references nyang.users(discord_user_id) on delete cascade,
  qty bigint not null default 0 check (qty >= 0),
  avg_price integer not null default 0 check (avg_price >= 0),
  updated_at timestamptz not null default now()
);

create or replace function nyang.stock_bucket_start(p_ts timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select date_trunc('minute', p_ts)
    - make_interval(mins => (extract(minute from p_ts)::int % 5));
$$;

create or replace function nyang.sync_stock_market(p_now timestamptz default now())
returns void
language plpgsql
set search_path = nyang, public
as $$
declare
  v_market nyang.stock_market%rowtype;
  v_last nyang.stock_candles%rowtype;
  v_target_bucket timestamptz := nyang.stock_bucket_start(p_now);
  v_next_bucket timestamptz;
  v_open integer;
  v_close integer;
  v_high integer;
  v_low integer;
  v_noise double precision;
  v_spike_up double precision;
  v_spike_down double precision;
begin
  insert into nyang.stock_market(id)
  values (1)
  on conflict (id) do nothing;

  select *
  into v_market
  from nyang.stock_market
  where id = 1
  for update;

  select *
  into v_last
  from nyang.stock_candles
  order by bucket_start desc
  limit 1;

  if v_last.bucket_start is null then
    insert into nyang.stock_candles(
      bucket_start,
      open_price,
      high_price,
      low_price,
      close_price
    )
    values (
      v_target_bucket,
      v_market.current_price,
      v_market.current_price,
      v_market.current_price,
      v_market.current_price
    )
    on conflict (bucket_start) do nothing;

    update nyang.stock_market
    set updated_at = now()
    where id = 1;

    return;
  end if;

  while v_last.bucket_start < v_target_bucket loop
    v_next_bucket := v_last.bucket_start + interval '5 minute';
    v_open := v_last.close_price;

    v_noise := ((random() - 0.5) * 2.0) * (v_market.volatility_pct::double precision / 100.0);
    v_close := greatest(
      100,
      round(v_open * (1.0 + v_noise + (v_market.drift_pct::double precision / 100.0)))::integer
    );

    v_spike_up := random() * (v_market.volatility_pct::double precision / 120.0);
    v_spike_down := random() * (v_market.volatility_pct::double precision / 120.0);

    v_high := greatest(
      v_open,
      v_close,
      round(greatest(v_open, v_close) * (1.0 + v_spike_up))::integer
    );

    v_low := least(
      v_open,
      v_close,
      round(least(v_open, v_close) * greatest(0.01, (1.0 - v_spike_down)))::integer
    );
    v_low := greatest(50, v_low);

    insert into nyang.stock_candles(
      bucket_start,
      open_price,
      high_price,
      low_price,
      close_price
    )
    values (
      v_next_bucket,
      v_open,
      v_high,
      v_low,
      v_close
    )
    on conflict (bucket_start) do nothing;

    select *
    into v_last
    from nyang.stock_candles
    where bucket_start = v_next_bucket;
  end loop;

  update nyang.stock_market
  set
    current_price = v_last.close_price,
    updated_at = now()
  where id = 1;
end;
$$;

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
    limit 48
  ) c;

  return next;
end;
$$;

drop function if exists nyang.trade_stock(text, text, integer);

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
  out_price := v_market.current_price;
  out_qty := p_qty;

  v_gross := v_market.current_price * p_qty;
  v_fee := ceil((v_gross::numeric * v_market.fee_bps::numeric) / 10000.0)::integer;

  if v_side = 'buy' then
    v_settlement := v_gross + v_fee;
    if v_balance < v_settlement then
      out_error_code := 'INSUFFICIENT_POINTS';
      out_new_balance := v_balance;
      out_holding_qty := v_holding.qty;
      out_holding_avg_price := v_holding.avg_price;
      out_unrealized_pnl := (v_market.current_price - v_holding.avg_price) * v_holding.qty;
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
        ((v_holding.qty * v_holding.avg_price)::numeric + (p_qty * v_market.current_price)::numeric)
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

    update nyang.stock_candles
    set volume_buy = volume_buy + p_qty
    where bucket_start = (select max(bucket_start) from nyang.stock_candles);

    insert into nyang.point_events(discord_user_id, kind, amount, meta)
    values (
      p_discord_user_id,
      'stock_buy_spend',
      -v_settlement,
      jsonb_build_object(
        'side', 'buy',
        'symbol', v_market.symbol,
        'qty', p_qty,
        'price', v_market.current_price,
        'gross', v_gross,
        'fee', v_fee,
        'settlement', v_settlement
      )
    );

    v_balance := v_balance - v_settlement;
  else
    if v_holding.qty < p_qty then
      out_error_code := 'INSUFFICIENT_HOLDINGS';
      out_new_balance := v_balance;
      out_holding_qty := v_holding.qty;
      out_holding_avg_price := v_holding.avg_price;
      out_unrealized_pnl := (v_market.current_price - v_holding.avg_price) * v_holding.qty;
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

    update nyang.stock_candles
    set volume_sell = volume_sell + p_qty
    where bucket_start = (select max(bucket_start) from nyang.stock_candles);

    insert into nyang.point_events(discord_user_id, kind, amount, meta)
    values (
      p_discord_user_id,
      'stock_sell_gain',
      v_settlement,
      jsonb_build_object(
        'side', 'sell',
        'symbol', v_market.symbol,
        'qty', p_qty,
        'price', v_market.current_price,
        'gross', v_gross,
        'fee', v_fee,
        'settlement', v_settlement
      )
    );

    v_balance := v_balance + v_settlement;
  end if;

  out_success := true;
  out_error_code := null;
  out_gross := v_gross;
  out_fee := v_fee;
  out_settlement := v_settlement;
  out_new_balance := v_balance;
  out_holding_qty := v_new_holding_qty;
  out_holding_avg_price := v_new_avg_price;
  out_unrealized_pnl := (v_market.current_price - v_new_avg_price) * v_new_holding_qty;
  return next;
end;
$$;
