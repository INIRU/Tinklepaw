create table if not exists nyang.stock_market_maker_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  bucket_start timestamptz not null,
  actor text not null check (actor in ('whale', 'shrimp', 'ant')),
  side text not null check (side in ('buy', 'sell')),
  qty integer not null check (qty > 0),
  impact_bps integer not null check (impact_bps >= 0),
  price_before integer not null check (price_before > 0),
  price_after integer not null check (price_after > 0),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists stock_market_maker_events_bucket_desc_idx
  on nyang.stock_market_maker_events(bucket_start desc, created_at desc);

alter table nyang.stock_market_maker_events
  drop constraint if exists stock_market_maker_events_actor_check;

alter table nyang.stock_market_maker_events
  add constraint stock_market_maker_events_actor_check
  check (actor in ('whale', 'shrimp', 'ant'));

alter table nyang.app_config
  add column if not exists stock_market_maker_interval_ms integer,
  add column if not exists stock_whale_max_buy_qty integer not null default 320,
  add column if not exists stock_whale_max_sell_qty integer not null default 320,
  add column if not exists stock_shrimp_max_buy_qty integer not null default 28,
  add column if not exists stock_shrimp_max_sell_qty integer not null default 28,
  add column if not exists stock_ant_auto_buy_qty integer not null default 8,
  add column if not exists stock_ant_auto_buy_cooldown_seconds integer not null default 120;

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
  v_actor text;
  v_cfg nyang.app_config%rowtype;
  v_last_close integer;
  v_prev_close integer;
  v_buy_bias numeric := 0.5;
  v_direction_signal integer := 0;
  v_whale_max_buy_qty integer := 320;
  v_whale_max_sell_qty integer := 320;
  v_shrimp_max_buy_qty integer := 28;
  v_shrimp_max_sell_qty integer := 28;
  v_ant_auto_buy_qty integer := 8;
  v_ant_auto_buy_cooldown_seconds integer := 120;
  v_last_ant_buy_at timestamptz;
  v_ant_due boolean := false;
  v_side_cap integer := 1;
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

  select *
  into v_cfg
  from nyang.app_config
  where id = 1
  for update;

  if found then
    v_whale_max_buy_qty := greatest(1, least(5000, coalesce(v_cfg.stock_whale_max_buy_qty, 320)));
    v_whale_max_sell_qty := greatest(1, least(5000, coalesce(v_cfg.stock_whale_max_sell_qty, 320)));
    v_shrimp_max_buy_qty := greatest(1, least(1000, coalesce(v_cfg.stock_shrimp_max_buy_qty, 28)));
    v_shrimp_max_sell_qty := greatest(1, least(1000, coalesce(v_cfg.stock_shrimp_max_sell_qty, 28)));
    v_ant_auto_buy_qty := greatest(1, least(500, coalesce(v_cfg.stock_ant_auto_buy_qty, 8)));
    v_ant_auto_buy_cooldown_seconds := greatest(10, least(3600, coalesce(v_cfg.stock_ant_auto_buy_cooldown_seconds, 120)));
  end if;

  v_bucket := nyang.stock_bucket_start(now());

  select close_price
  into v_last_close
  from nyang.stock_candles
  order by bucket_start desc
  limit 1;

  select close_price
  into v_prev_close
  from nyang.stock_candles
  order by bucket_start desc
  offset 1
  limit 1;

  if v_last_close is not null and v_prev_close is not null then
    v_direction_signal := case
      when v_last_close > v_prev_close then 1
      when v_last_close < v_prev_close then -1
      else 0
    end;
  end if;

  if v_direction_signal > 0 then
    v_buy_bias := 0.57;
  elsif v_direction_signal < 0 then
    v_buy_bias := 0.43;
  else
    v_buy_bias := 0.5;
  end if;

  select created_at
  into v_last_ant_buy_at
  from nyang.stock_market_maker_events
  where actor = 'ant' and side = 'buy'
  order by created_at desc
  limit 1;

  v_ant_due := v_last_ant_buy_at is null
    or v_last_ant_buy_at <= now() - make_interval(secs => v_ant_auto_buy_cooldown_seconds);

  if v_ant_due then
    v_actor := 'ant';
    v_side := 'buy';
    v_qty := v_ant_auto_buy_qty;
  else
    v_actor := case
      when random() < 0.16 then 'whale'
      else 'shrimp'
    end;
    v_side := case when random() < v_buy_bias then 'buy' else 'sell' end;

    if v_actor = 'whale' then
      v_side_cap := case
        when v_side = 'buy' then v_whale_max_buy_qty
        else v_whale_max_sell_qty
      end;
    else
      v_side_cap := case
        when v_side = 'buy' then v_shrimp_max_buy_qty
        else v_shrimp_max_sell_qty
      end;
    end if;

    v_qty := greatest(1, ceil(random() * greatest(v_side_cap, 1))::integer);
  end if;

  if v_actor = 'whale' then
    v_impact_bps := least(320, greatest(12, ceil(sqrt(v_qty::numeric) * 14)::integer));
  elsif v_actor = 'shrimp' then
    v_impact_bps := least(96, greatest(3, ceil(sqrt(v_qty::numeric) * 6)::integer));
  else
    v_impact_bps := least(48, greatest(2, ceil(sqrt(v_qty::numeric) * 4)::integer));
  end if;

  v_price_delta := greatest(
    1,
    round((v_market.current_price::numeric * v_impact_bps::numeric) / 10000.0)::integer
  );

  if v_side = 'buy' then
    v_price_after := v_market.current_price + v_price_delta;
  else
    v_price_after := greatest(50, v_market.current_price - v_price_delta);
  end if;

  insert into nyang.stock_market_maker_events(
    bucket_start,
    actor,
    side,
    qty,
    impact_bps,
    price_before,
    price_after,
    metadata
  )
  values (
    v_bucket,
    v_actor,
    v_side,
    v_qty,
    v_impact_bps,
    v_market.current_price,
    v_price_after,
    jsonb_build_object(
      'source', 'market_maker',
      'actor', v_actor,
      'buy_bias', v_buy_bias,
      'direction_signal', v_direction_signal,
      'whale_max_buy_qty', v_whale_max_buy_qty,
      'whale_max_sell_qty', v_whale_max_sell_qty,
      'shrimp_max_buy_qty', v_shrimp_max_buy_qty,
      'shrimp_max_sell_qty', v_shrimp_max_sell_qty,
      'ant_auto_buy_qty', v_ant_auto_buy_qty,
      'ant_auto_buy_cooldown_seconds', v_ant_auto_buy_cooldown_seconds,
      'ant_due', v_ant_due
    )
  );

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
