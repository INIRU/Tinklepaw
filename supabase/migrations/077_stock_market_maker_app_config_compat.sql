create or replace function nyang.run_stock_market_maker()
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
  v_cfg_json jsonb;
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

  v_cfg_json := to_jsonb(v_cfg);

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

  v_whale_buy_max := greatest(
    1,
    least(
      5000,
      coalesce(
        nullif(v_cfg_json ->> 'stock_market_maker_whale_buy_max_qty', '')::integer,
        nullif(v_cfg_json ->> 'stock_whale_max_buy_qty', '')::integer,
        1600
      )
    )
  );
  v_whale_sell_max := greatest(
    1,
    least(
      5000,
      coalesce(
        nullif(v_cfg_json ->> 'stock_market_maker_whale_sell_max_qty', '')::integer,
        nullif(v_cfg_json ->> 'stock_whale_max_sell_qty', '')::integer,
        1500
      )
    )
  );
  v_shrimp_buy_max := greatest(
    1,
    least(
      1000,
      coalesce(
        nullif(v_cfg_json ->> 'stock_market_maker_shrimp_buy_max_qty', '')::integer,
        nullif(v_cfg_json ->> 'stock_shrimp_max_buy_qty', '')::integer,
        200
      )
    )
  );
  v_shrimp_sell_max := greatest(
    1,
    least(
      1000,
      coalesce(
        nullif(v_cfg_json ->> 'stock_market_maker_shrimp_sell_max_qty', '')::integer,
        nullif(v_cfg_json ->> 'stock_shrimp_max_sell_qty', '')::integer,
        180
      )
    )
  );
  v_ant_buy_qty := greatest(
    1,
    least(
      500,
      coalesce(
        nullif(v_cfg_json ->> 'stock_market_maker_ant_buy_qty', '')::integer,
        nullif(v_cfg_json ->> 'stock_ant_auto_buy_qty', '')::integer,
        24
      )
    )
  );
  v_ant_cooldown_sec := greatest(
    10,
    least(
      3600,
      coalesce(
        nullif(v_cfg_json ->> 'stock_market_maker_ant_cooldown_sec', '')::integer,
        nullif(v_cfg_json ->> 'stock_ant_auto_buy_cooldown_seconds', '')::integer,
        180
      )
    )
  );

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

grant execute on function nyang.run_stock_market_maker() to service_role;
