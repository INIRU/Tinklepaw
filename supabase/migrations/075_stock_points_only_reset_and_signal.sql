alter table nyang.app_config
  add column if not exists stock_news_behavior_bias_bps integer not null default 0,
  add column if not exists stock_news_behavior_signal_until timestamptz,
  add column if not exists stock_news_behavior_sentiment text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'nyang.app_config'::regclass
      and conname = 'app_config_stock_news_behavior_bias_bps_check'
  ) then
    alter table nyang.app_config
      add constraint app_config_stock_news_behavior_bias_bps_check
      check (stock_news_behavior_bias_bps between -5000 and 5000);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'nyang.app_config'::regclass
      and conname = 'app_config_stock_news_behavior_sentiment_check'
  ) then
    alter table nyang.app_config
      add constraint app_config_stock_news_behavior_sentiment_check
      check (
        stock_news_behavior_sentiment is null
        or stock_news_behavior_sentiment in ('bullish', 'bearish', 'neutral')
      );
  end if;
end
$$;

drop function if exists nyang.run_stock_market_maker();
drop function if exists nyang.apply_stock_news_impact(text, integer, text, text, text, text, jsonb);
drop function if exists nyang.trade_stock(text, text, integer);
drop function if exists nyang.get_stock_dashboard(text);
drop function if exists nyang.sync_stock_market(timestamptz);
drop function if exists nyang.exchange_points_to_nyang(text, integer);
drop function if exists nyang.exchange_nyang_to_points(text, integer);

create or replace function nyang.sync_stock_market(p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = nyang, public
as $$
declare
  v_target_bucket timestamptz := nyang.stock_bucket_start(p_now);
  v_last_bucket timestamptz;
  v_last_close integer;
  v_bucket timestamptz;
begin
  insert into nyang.stock_market (id, symbol, display_name, current_price, fee_bps, volatility_pct, drift_pct)
  values (1, 'KURO', '쿠로 전자', 100000, 40, 0, 0)
  on conflict (id) do nothing;

  perform 1
  from nyang.stock_market
  where id = 1
  for update;

  select c.bucket_start, c.close_price
  into v_last_bucket, v_last_close
  from nyang.stock_candles c
  order by c.bucket_start desc
  limit 1;

  if v_last_bucket is null then
    select m.current_price
    into v_last_close
    from nyang.stock_market m
    where m.id = 1;

    insert into nyang.stock_candles (
      bucket_start,
      open_price,
      high_price,
      low_price,
      close_price,
      volume_buy,
      volume_sell
    )
    values (
      v_target_bucket,
      v_last_close,
      v_last_close,
      v_last_close,
      v_last_close,
      0,
      0
    )
    on conflict (bucket_start) do nothing;

    update nyang.stock_market
    set current_price = v_last_close,
        volatility_pct = 0,
        drift_pct = 0,
        updated_at = now()
    where id = 1;
    return;
  end if;

  if v_last_bucket < v_target_bucket then
    v_bucket := v_last_bucket + interval '5 minutes';
    while v_bucket <= v_target_bucket loop
      insert into nyang.stock_candles (
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
        v_last_close,
        v_last_close,
        v_last_close,
        v_last_close,
        0,
        0
      )
      on conflict (bucket_start) do nothing;

      v_bucket := v_bucket + interval '5 minutes';
    end loop;
  end if;

  select c.close_price
  into v_last_close
  from nyang.stock_candles c
  order by c.bucket_start desc
  limit 1;

  update nyang.stock_market
  set current_price = v_last_close,
      volatility_pct = 0,
      drift_pct = 0,
      updated_at = now()
  where id = 1;
end
$$;

create function nyang.get_stock_dashboard(p_discord_user_id text)
returns table(
  out_symbol text,
  out_display_name text,
  out_price integer,
  out_change_pct numeric,
  out_fee_bps integer,
  out_balance integer,
  out_holding_qty integer,
  out_holding_avg_price integer,
  out_holding_value bigint,
  out_unrealized_pnl bigint,
  out_candles jsonb
)
language plpgsql
security definer
set search_path = nyang, public
as $$
declare
  v_market nyang.stock_market%rowtype;
  v_balance integer;
  v_holding nyang.stock_holdings%rowtype;
  v_prev_close integer;
  v_change_pct numeric := 0;
begin
  perform nyang.ensure_user(p_discord_user_id);
  perform nyang.sync_stock_market(now());

  insert into nyang.point_balances (discord_user_id, balance)
  values (p_discord_user_id, 0)
  on conflict (discord_user_id) do nothing;

  insert into nyang.stock_holdings (discord_user_id, qty, avg_price)
  values (p_discord_user_id, 0, 0)
  on conflict (discord_user_id) do nothing;

  select *
  into v_market
  from nyang.stock_market
  where id = 1;

  select pb.balance
  into v_balance
  from nyang.point_balances pb
  where pb.discord_user_id = p_discord_user_id;

  select *
  into v_holding
  from nyang.stock_holdings sh
  where sh.discord_user_id = p_discord_user_id;

  select c.close_price
  into v_prev_close
  from nyang.stock_candles c
  order by c.bucket_start desc
  offset 1
  limit 1;

  if v_prev_close is not null and v_prev_close > 0 then
    v_change_pct := round((v_market.current_price - v_prev_close)::numeric * 100.0 / v_prev_close, 2);
  end if;

  return query
  with candles as (
    select c.bucket_start, c.open_price, c.high_price, c.low_price, c.close_price, c.volume_buy, c.volume_sell
    from nyang.stock_candles c
    order by c.bucket_start desc
    limit 72
  )
  select
    v_market.symbol,
    v_market.display_name,
    v_market.current_price,
    v_change_pct,
    v_market.fee_bps,
    v_balance,
    v_holding.qty,
    v_holding.avg_price,
    (v_holding.qty::bigint * v_market.current_price::bigint),
    (v_holding.qty::bigint * (v_market.current_price - v_holding.avg_price)::bigint),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            't', x.bucket_start,
            'o', x.open_price,
            'h', x.high_price,
            'l', x.low_price,
            'c', x.close_price,
            'vb', x.volume_buy,
            'vs', x.volume_sell
          )
          order by x.bucket_start
        )
        from candles x
      ),
      '[]'::jsonb
    );
end
$$;

create function nyang.trade_stock(
  p_discord_user_id text,
  p_side text,
  p_qty integer
)
returns table(
  out_success boolean,
  out_error_code text,
  out_side text,
  out_price integer,
  out_qty integer,
  out_gross bigint,
  out_fee bigint,
  out_settlement bigint,
  out_new_balance integer,
  out_holding_qty integer,
  out_holding_avg_price integer,
  out_unrealized_pnl bigint
)
language plpgsql
security definer
set search_path = nyang, public
as $$
declare
  v_side text := lower(coalesce(p_side, ''));
  v_market nyang.stock_market%rowtype;
  v_balance nyang.point_balances%rowtype;
  v_holding nyang.stock_holdings%rowtype;
  v_bucket timestamptz := nyang.stock_bucket_start(now());
  v_pre_price integer;
  v_new_price integer;
  v_exec_price integer;
  v_impact_bps integer;
  v_price_delta integer;
  v_gross bigint;
  v_fee bigint;
  v_total_cost bigint;
  v_settlement bigint;
  v_new_qty integer;
  v_new_avg integer;
  v_new_balance integer;
begin
  if p_qty is null or p_qty <= 0 then
    return query select false, 'INVALID_QTY', v_side, 0, coalesce(p_qty, 0), 0, 0, 0, 0, 0, 0, 0;
    return;
  end if;

  if p_qty > 1000000 then
    return query select false, 'QTY_TOO_LARGE', v_side, 0, p_qty, 0, 0, 0, 0, 0, 0, 0;
    return;
  end if;

  if v_side not in ('buy', 'sell') then
    return query select false, 'INVALID_SIDE', v_side, 0, p_qty, 0, 0, 0, 0, 0, 0, 0;
    return;
  end if;

  perform nyang.ensure_user(p_discord_user_id);
  perform nyang.sync_stock_market(now());

  insert into nyang.point_balances (discord_user_id, balance)
  values (p_discord_user_id, 0)
  on conflict (discord_user_id) do nothing;

  insert into nyang.stock_holdings (discord_user_id, qty, avg_price)
  values (p_discord_user_id, 0, 0)
  on conflict (discord_user_id) do nothing;

  select *
  into v_market
  from nyang.stock_market
  where id = 1
  for update;

  select *
  into v_balance
  from nyang.point_balances
  where discord_user_id = p_discord_user_id
  for update;

  select *
  into v_holding
  from nyang.stock_holdings
  where discord_user_id = p_discord_user_id
  for update;

  v_pre_price := greatest(1, v_market.current_price);
  v_impact_bps := least(320, greatest(12, ceil(sqrt(p_qty::numeric) * 12)::integer));
  v_price_delta := greatest(1, round(v_pre_price::numeric * (v_impact_bps::numeric / 10000.0))::integer);

  if v_side = 'buy' then
    v_new_price := v_pre_price + v_price_delta;
  else
    v_new_price := greatest(50, v_pre_price - v_price_delta);
  end if;

  v_exec_price := greatest(1, round((v_pre_price::numeric + v_new_price::numeric) / 2.0)::integer);
  v_gross := v_exec_price::bigint * p_qty::bigint;
  v_fee := greatest(1::bigint, floor(v_gross::numeric * (v_market.fee_bps::numeric / 10000.0))::bigint);

  if v_side = 'buy' then
    v_total_cost := v_gross + v_fee;

    if v_balance.balance::bigint < v_total_cost then
      return query
      select false, 'INSUFFICIENT_POINTS', v_side, v_exec_price, p_qty, v_gross, v_fee, v_total_cost,
             v_balance.balance, v_holding.qty, v_holding.avg_price,
             (v_holding.qty::bigint * (v_exec_price - v_holding.avg_price)::bigint);
      return;
    end if;

    v_new_balance := v_balance.balance - v_total_cost::integer;
    v_new_qty := v_holding.qty + p_qty;
    if v_new_qty > 0 then
      v_new_avg := floor(((v_holding.qty::numeric * v_holding.avg_price::numeric) + (p_qty::numeric * v_exec_price::numeric)) / v_new_qty::numeric)::integer;
    else
      v_new_avg := 0;
    end if;

    update nyang.point_balances
    set balance = v_new_balance
    where discord_user_id = p_discord_user_id;

    update nyang.stock_holdings
    set qty = v_new_qty,
        avg_price = v_new_avg,
        updated_at = now()
    where discord_user_id = p_discord_user_id;

    insert into nyang.point_events (discord_user_id, kind, amount, meta)
    values (
      p_discord_user_id,
      'stock_buy_spend',
      -v_total_cost,
      jsonb_build_object(
        'qty', p_qty,
        'price', v_exec_price,
        'gross', v_gross,
        'fee', v_fee,
        'impact_bps', v_impact_bps,
        'pre_price', v_pre_price,
        'post_price', v_new_price
      )
    );

    v_settlement := v_total_cost;
  else
    if v_holding.qty < p_qty then
      return query
      select false, 'INSUFFICIENT_HOLDINGS', v_side, v_exec_price, p_qty, v_gross, v_fee, 0,
             v_balance.balance, v_holding.qty, v_holding.avg_price,
             (v_holding.qty::bigint * (v_exec_price - v_holding.avg_price)::bigint);
      return;
    end if;

    v_settlement := v_gross - v_fee;
    v_new_balance := v_balance.balance + v_settlement::integer;
    v_new_qty := v_holding.qty - p_qty;
    v_new_avg := case when v_new_qty = 0 then 0 else v_holding.avg_price end;

    update nyang.point_balances
    set balance = v_new_balance
    where discord_user_id = p_discord_user_id;

    update nyang.stock_holdings
    set qty = v_new_qty,
        avg_price = v_new_avg,
        updated_at = now()
    where discord_user_id = p_discord_user_id;

    insert into nyang.point_events (discord_user_id, kind, amount, meta)
    values (
      p_discord_user_id,
      'stock_sell_gain',
      v_settlement,
      jsonb_build_object(
        'qty', p_qty,
        'price', v_exec_price,
        'gross', v_gross,
        'fee', v_fee,
        'impact_bps', v_impact_bps,
        'pre_price', v_pre_price,
        'post_price', v_new_price
      )
    );
  end if;

  insert into nyang.stock_candles (
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
    v_pre_price,
    greatest(v_pre_price, v_new_price),
    least(v_pre_price, v_new_price),
    v_new_price,
    case when v_side = 'buy' then p_qty else 0 end,
    case when v_side = 'sell' then p_qty else 0 end
  )
  on conflict (bucket_start) do nothing;

  update nyang.stock_candles
  set high_price = greatest(high_price, v_pre_price, v_new_price),
      low_price = least(low_price, v_pre_price, v_new_price),
      close_price = v_new_price,
      volume_buy = volume_buy + case when v_side = 'buy' then p_qty else 0 end,
      volume_sell = volume_sell + case when v_side = 'sell' then p_qty else 0 end
  where bucket_start = v_bucket;

  update nyang.stock_market
  set current_price = v_new_price,
      updated_at = now()
  where id = 1;

  return query
  select
    true,
    null::text,
    v_side,
    v_exec_price,
    p_qty,
    v_gross,
    v_fee,
    v_settlement,
    v_new_balance,
    v_new_qty,
    v_new_avg,
    (v_new_qty::bigint * (v_exec_price - v_new_avg)::bigint);
end
$$;

create function nyang.apply_stock_news_impact(
  p_sentiment text,
  p_impact_bps integer,
  p_headline text,
  p_body text,
  p_source text default null,
  p_channel_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table(
  out_event_id bigint,
  out_price_before integer,
  out_price_after integer,
  out_signed_impact_bps integer,
  out_bucket_start timestamptz
)
language plpgsql
security definer
set search_path = nyang, public
as $$
declare
  v_now timestamptz := now();
  v_bucket timestamptz := nyang.stock_bucket_start(v_now);
  v_market nyang.stock_market%rowtype;
  v_cfg nyang.app_config%rowtype;
  v_sentiment text := lower(coalesce(p_sentiment, 'neutral'));
  v_abs_impact integer := least(5000, greatest(0, coalesce(p_impact_bps, 0)));
  v_signed integer := 0;
  v_event_id bigint;
  v_price_before integer;
  v_price_after integer;
  v_signal_minutes integer;
  v_signal_until timestamptz;
begin
  perform nyang.sync_stock_market(v_now);

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

  if v_sentiment not in ('bullish', 'bearish', 'neutral') then
    v_sentiment := 'neutral';
  end if;

  if v_sentiment = 'bullish' then
    v_signed := v_abs_impact;
  elsif v_sentiment = 'bearish' then
    v_signed := -v_abs_impact;
  else
    v_signed := 0;
  end if;

  v_price_before := v_market.current_price;
  v_price_after := v_market.current_price;
  v_signal_minutes := greatest(5, least(240, coalesce(v_cfg.stock_news_interval_minutes, 30)));
  v_signal_until := v_now + make_interval(mins => v_signal_minutes);

  update nyang.app_config
  set stock_news_behavior_bias_bps = v_signed,
      stock_news_behavior_signal_until = v_signal_until,
      stock_news_behavior_sentiment = v_sentiment,
      stock_news_last_sent_at = now(),
      stock_news_force_run_at = null
  where id = 1;

  insert into nyang.stock_news_events (
    sentiment,
    impact_bps,
    headline,
    body,
    source,
    channel_id,
    price_before,
    price_after,
    metadata
  )
  values (
    v_sentiment,
    abs(v_signed),
    nullif(btrim(coalesce(p_headline, '')), ''),
    nullif(btrim(coalesce(p_body, '')), ''),
    nullif(btrim(coalesce(p_source, '')), ''),
    nullif(btrim(coalesce(p_channel_id, '')), ''),
    v_price_before,
    v_price_after,
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'mode', 'behavior_signal',
        'signal_until', v_signal_until,
        'signal_minutes', v_signal_minutes,
        'signed_impact_bps', v_signed
      )
  )
  returning id into v_event_id;

  return query select v_event_id, v_price_before, v_price_after, v_signed, v_bucket;
end
$$;

create function nyang.run_stock_market_maker()
returns table(
  out_applied boolean,
  out_bucket_start timestamptz,
  out_side text,
  out_qty integer,
  out_impact_bps integer,
  out_price_before integer,
  out_price_after integer
)
language plpgsql
security definer
set search_path = nyang, public
as $$
declare
  v_now timestamptz := now();
  v_bucket timestamptz := nyang.stock_bucket_start(v_now);
  v_market nyang.stock_market%rowtype;
  v_cfg nyang.app_config%rowtype;
  v_latest_close integer;
  v_prev_close integer;
  v_direction text := 'flat';
  v_base_buy_bias numeric := 0.5;
  v_signal_bias numeric := 0;
  v_buy_bias numeric := 0.5;
  v_actor text;
  v_side text;
  v_qty integer;
  v_impact_bps integer;
  v_price_before integer;
  v_price_after integer;
  v_price_delta integer;
  v_pick numeric;
  v_whale_buy_max integer;
  v_whale_sell_max integer;
  v_shrimp_buy_max integer;
  v_shrimp_sell_max integer;
  v_ant_buy_qty integer;
  v_ant_cooldown_sec integer;
  v_last_ant_at timestamptz;
  v_ant_due boolean;
begin
  perform nyang.sync_stock_market(v_now);

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

  select c.close_price
  into v_latest_close
  from nyang.stock_candles c
  order by c.bucket_start desc
  limit 1;

  select c.close_price
  into v_prev_close
  from nyang.stock_candles c
  order by c.bucket_start desc
  offset 1
  limit 1;

  if v_prev_close is not null then
    if v_latest_close > v_prev_close then
      v_direction := 'up';
      v_base_buy_bias := 0.57;
    elsif v_latest_close < v_prev_close then
      v_direction := 'down';
      v_base_buy_bias := 0.43;
    else
      v_direction := 'flat';
      v_base_buy_bias := 0.50;
    end if;
  end if;

  if v_cfg.stock_news_behavior_signal_until is not null
     and v_cfg.stock_news_behavior_signal_until > v_now then
    v_signal_bias := greatest(-0.35, least(0.35, coalesce(v_cfg.stock_news_behavior_bias_bps, 0)::numeric / 10000.0));
  else
    v_signal_bias := 0;
  end if;

  v_buy_bias := greatest(0.10, least(0.90, v_base_buy_bias + v_signal_bias));

  v_whale_buy_max := greatest(1, least(5000, coalesce(v_cfg.stock_market_maker_whale_buy_max_qty, 1600)));
  v_whale_sell_max := greatest(1, least(5000, coalesce(v_cfg.stock_market_maker_whale_sell_max_qty, 1500)));
  v_shrimp_buy_max := greatest(1, least(1000, coalesce(v_cfg.stock_market_maker_shrimp_buy_max_qty, 200)));
  v_shrimp_sell_max := greatest(1, least(1000, coalesce(v_cfg.stock_market_maker_shrimp_sell_max_qty, 180)));
  v_ant_buy_qty := greatest(1, least(500, coalesce(v_cfg.stock_market_maker_ant_buy_qty, 24)));
  v_ant_cooldown_sec := greatest(10, least(3600, coalesce(v_cfg.stock_market_maker_ant_cooldown_sec, 180)));

  select e.created_at
  into v_last_ant_at
  from nyang.stock_market_maker_events e
  where e.actor = 'ant'
  order by e.created_at desc
  limit 1;

  v_ant_due := (v_last_ant_at is null)
    or (v_last_ant_at <= (v_now - make_interval(secs => v_ant_cooldown_sec)));

  v_pick := random();
  if v_ant_due then
    if v_pick < 0.16 then
      v_actor := 'whale';
    elsif v_pick < 0.80 then
      v_actor := 'shrimp';
    else
      v_actor := 'ant';
    end if;
  else
    if v_pick < 0.20 then
      v_actor := 'whale';
    else
      v_actor := 'shrimp';
    end if;
  end if;

  if v_actor = 'ant' then
    v_side := 'buy';
    v_qty := v_ant_buy_qty;
  else
    v_side := case when random() < v_buy_bias then 'buy' else 'sell' end;
    if v_actor = 'whale' then
      if v_side = 'buy' then
        v_qty := greatest(1, floor(random() * v_whale_buy_max)::integer + 1);
      else
        v_qty := greatest(1, floor(random() * v_whale_sell_max)::integer + 1);
      end if;
    else
      if v_side = 'buy' then
        v_qty := greatest(1, floor(random() * v_shrimp_buy_max)::integer + 1);
      else
        v_qty := greatest(1, floor(random() * v_shrimp_sell_max)::integer + 1);
      end if;
    end if;
  end if;

  if v_actor = 'whale' then
    v_impact_bps := least(420, greatest(24, ceil(sqrt(v_qty::numeric) * 14)::integer));
  elsif v_actor = 'shrimp' then
    v_impact_bps := least(220, greatest(12, ceil(sqrt(v_qty::numeric) * 10)::integer));
  else
    v_impact_bps := least(80, greatest(6, ceil(sqrt(v_qty::numeric) * 8)::integer));
  end if;

  v_price_before := v_market.current_price;
  v_price_delta := greatest(1, round(v_price_before::numeric * (v_impact_bps::numeric / 10000.0))::integer);
  if v_side = 'buy' then
    v_price_after := v_price_before + v_price_delta;
  else
    v_price_after := greatest(50, v_price_before - v_price_delta);
  end if;

  insert into nyang.stock_candles (
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
    v_price_before,
    greatest(v_price_before, v_price_after),
    least(v_price_before, v_price_after),
    v_price_after,
    case when v_side = 'buy' then v_qty else 0 end,
    case when v_side = 'sell' then v_qty else 0 end
  )
  on conflict (bucket_start) do nothing;

  update nyang.stock_candles
  set high_price = greatest(high_price, v_price_before, v_price_after),
      low_price = least(low_price, v_price_before, v_price_after),
      close_price = v_price_after,
      volume_buy = volume_buy + case when v_side = 'buy' then v_qty else 0 end,
      volume_sell = volume_sell + case when v_side = 'sell' then v_qty else 0 end
  where bucket_start = v_bucket;

  update nyang.stock_market
  set current_price = v_price_after,
      updated_at = now()
  where id = 1;

  insert into nyang.stock_market_maker_events (
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
    v_price_before,
    v_price_after,
    jsonb_build_object(
      'direction_signal', v_direction,
      'base_buy_bias', v_base_buy_bias,
      'signal_bias_bps', coalesce(v_cfg.stock_news_behavior_bias_bps, 0),
      'signal_sentiment', v_cfg.stock_news_behavior_sentiment,
      'signal_until', v_cfg.stock_news_behavior_signal_until,
      'final_buy_bias', v_buy_bias,
      'ant_due', v_ant_due,
      'whale_buy_max', v_whale_buy_max,
      'whale_sell_max', v_whale_sell_max,
      'shrimp_buy_max', v_shrimp_buy_max,
      'shrimp_sell_max', v_shrimp_sell_max,
      'ant_buy_qty', v_ant_buy_qty,
      'ant_cooldown_sec', v_ant_cooldown_sec
    )
  );

  return query
  select true, v_bucket, v_side, v_qty, v_impact_bps, v_price_before, v_price_after;
end
$$;

do $$
begin
  if to_regclass('nyang.stock_nyang_balances') is null then
    return;
  end if;

  insert into nyang.point_balances (discord_user_id, balance)
  select b.discord_user_id, 0
  from nyang.stock_nyang_balances b
  on conflict (discord_user_id) do nothing;

  with moved as (
    select b.discord_user_id, b.balance
    from nyang.stock_nyang_balances b
    where b.balance > 0
  )
  update nyang.point_balances pb
  set balance = pb.balance + moved.balance
  from moved
  where pb.discord_user_id = moved.discord_user_id;

  insert into nyang.point_events (discord_user_id, kind, amount, meta)
  select
    b.discord_user_id,
    'stock_nyang_sunset_credit',
    b.balance,
    jsonb_build_object(
      'source', 'stock_points_only_reset',
      'migrated_from', 'stock_nyang_balances'
    )
  from nyang.stock_nyang_balances b
  where b.balance > 0;
end
$$;

drop table if exists nyang.stock_nyang_events;
drop table if exists nyang.stock_nyang_balances;

create or replace function nyang.reset_stock_market_points_only(p_start_price integer default 100000)
returns void
language plpgsql
security definer
set search_path = nyang, public
as $$
declare
  v_price integer := greatest(50, coalesce(p_start_price, 100000));
  v_bucket timestamptz := nyang.stock_bucket_start(now());
begin
  truncate table nyang.stock_holdings;
  truncate table nyang.stock_candles;
  truncate table nyang.stock_news_events restart identity;
  truncate table nyang.stock_market_maker_events restart identity;

  insert into nyang.stock_market (
    id,
    symbol,
    display_name,
    current_price,
    fee_bps,
    volatility_pct,
    drift_pct,
    updated_at
  )
  values (
    1,
    'KURO',
    '쿠로 전자',
    v_price,
    40,
    0,
    0,
    now()
  )
  on conflict (id) do update
  set symbol = excluded.symbol,
      display_name = excluded.display_name,
      current_price = excluded.current_price,
      fee_bps = excluded.fee_bps,
      volatility_pct = excluded.volatility_pct,
      drift_pct = excluded.drift_pct,
      updated_at = excluded.updated_at;

  insert into nyang.stock_candles (
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
    v_price,
    v_price,
    v_price,
    v_price,
    0,
    0
  )
  on conflict (bucket_start) do update
  set open_price = excluded.open_price,
      high_price = excluded.high_price,
      low_price = excluded.low_price,
      close_price = excluded.close_price,
      volume_buy = excluded.volume_buy,
      volume_sell = excluded.volume_sell;

  update nyang.app_config
  set stock_news_behavior_bias_bps = 0,
      stock_news_behavior_signal_until = null,
      stock_news_behavior_sentiment = null,
      stock_news_force_run_at = null,
      stock_news_force_sentiment = null,
      stock_news_force_tier = null,
      stock_news_force_scenario = null,
      stock_news_last_sent_at = null;
end
$$;

grant execute on function nyang.sync_stock_market(timestamptz) to service_role;
grant execute on function nyang.get_stock_dashboard(text) to service_role;
grant execute on function nyang.trade_stock(text, text, integer) to service_role;
grant execute on function nyang.apply_stock_news_impact(text, integer, text, text, text, text, jsonb) to service_role;
grant execute on function nyang.run_stock_market_maker() to service_role;
grant execute on function nyang.reset_stock_market_points_only(integer) to service_role;
