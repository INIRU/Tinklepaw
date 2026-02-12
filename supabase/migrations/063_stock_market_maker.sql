create table if not exists nyang.stock_market_maker_runs (
  bucket_start timestamptz primary key,
  created_at timestamptz not null default now(),
  side text not null check (side in ('buy', 'sell')),
  qty integer not null check (qty > 0),
  impact_bps integer not null check (impact_bps >= 0),
  price_before integer not null check (price_before > 0),
  price_after integer not null check (price_after > 0),
  metadata jsonb not null default '{}'::jsonb
);

create or replace function nyang.run_stock_market_maker()
returns table (
  out_applied boolean,
  out_bucket_start timestamptz,
  out_side text,
  out_qty integer,
  out_impact_bps integer,
  out_price_before integer,
  out_price_after integer
)
language plpgsql
set search_path = nyang, public
as $$
declare
  v_market nyang.stock_market%rowtype;
  v_bucket timestamptz;
  v_side text;
  v_qty integer;
  v_impact_bps integer;
  v_price_delta integer;
  v_price_after integer;
begin
  out_applied := false;
  out_bucket_start := null;
  out_side := null;
  out_qty := 0;
  out_impact_bps := 0;
  out_price_before := 0;
  out_price_after := 0;

  perform nyang.sync_stock_market(now());

  select *
  into v_market
  from nyang.stock_market
  where id = 1
  for update;

  v_bucket := nyang.stock_bucket_start(now());
  v_side := case when random() < 0.52 then 'buy' else 'sell' end;
  v_qty := (6 + floor(random() * 25))::integer;
  v_impact_bps := least(120, greatest(8, ceil(sqrt(v_qty::numeric) * 8)::integer));
  v_price_delta := greatest(
    1,
    round((v_market.current_price::numeric * v_impact_bps::numeric) / 10000.0)::integer
  );

  if v_side = 'buy' then
    v_price_after := v_market.current_price + v_price_delta;
  else
    v_price_after := greatest(50, v_market.current_price - v_price_delta);
  end if;

  insert into nyang.stock_market_maker_runs(
    bucket_start,
    side,
    qty,
    impact_bps,
    price_before,
    price_after,
    metadata
  )
  values (
    v_bucket,
    v_side,
    v_qty,
    v_impact_bps,
    v_market.current_price,
    v_price_after,
    jsonb_build_object('source', 'market_maker')
  )
  on conflict (bucket_start) do nothing;

  if not found then
    out_applied := false;
    out_bucket_start := v_bucket;
    return next;
    return;
  end if;

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
    v_bucket,
    v_market.current_price,
    v_market.current_price,
    v_market.current_price,
    v_market.current_price,
    0,
    0
  )
  on conflict (bucket_start) do nothing;

  update nyang.stock_candles
  set
    high_price = greatest(high_price, v_price_after),
    low_price = least(low_price, v_price_after),
    close_price = v_price_after,
    volume_buy = volume_buy + case when v_side = 'buy' then v_qty else 0 end,
    volume_sell = volume_sell + case when v_side = 'sell' then v_qty else 0 end
  where bucket_start = v_bucket;

  update nyang.stock_market
  set
    current_price = v_price_after,
    updated_at = now()
  where id = 1;

  out_applied := true;
  out_bucket_start := v_bucket;
  out_side := v_side;
  out_qty := v_qty;
  out_impact_bps := v_impact_bps;
  out_price_before := v_market.current_price;
  out_price_after := v_price_after;
  return next;
end;
$$;
