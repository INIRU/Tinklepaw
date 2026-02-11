alter table nyang.app_config
  add column if not exists stock_news_enabled boolean not null default false,
  add column if not exists stock_news_channel_id text,
  add column if not exists stock_news_schedule_mode text not null default 'interval',
  add column if not exists stock_news_interval_minutes integer not null default 60,
  add column if not exists stock_news_daily_window_start_hour smallint not null default 9,
  add column if not exists stock_news_daily_window_end_hour smallint not null default 23,
  add column if not exists stock_news_min_impact_bps integer not null default 40,
  add column if not exists stock_news_max_impact_bps integer not null default 260,
  add column if not exists stock_news_last_sent_at timestamptz,
  add column if not exists stock_news_next_run_at timestamptz,
  add column if not exists stock_news_force_run_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_config_stock_news_schedule_mode_check'
      and conrelid = 'nyang.app_config'::regclass
  ) then
    alter table nyang.app_config
      add constraint app_config_stock_news_schedule_mode_check
      check (stock_news_schedule_mode in ('interval', 'daily_random'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_config_stock_news_interval_minutes_check'
      and conrelid = 'nyang.app_config'::regclass
  ) then
    alter table nyang.app_config
      add constraint app_config_stock_news_interval_minutes_check
      check (stock_news_interval_minutes between 5 and 1440);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_config_stock_news_window_hours_check'
      and conrelid = 'nyang.app_config'::regclass
  ) then
    alter table nyang.app_config
      add constraint app_config_stock_news_window_hours_check
      check (
        stock_news_daily_window_start_hour between 0 and 23
        and stock_news_daily_window_end_hour between 0 and 23
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_config_stock_news_impact_bounds_check'
      and conrelid = 'nyang.app_config'::regclass
  ) then
    alter table nyang.app_config
      add constraint app_config_stock_news_impact_bounds_check
      check (
        stock_news_min_impact_bps between 0 and 5000
        and stock_news_max_impact_bps between 0 and 5000
        and stock_news_max_impact_bps >= stock_news_min_impact_bps
      );
  end if;
end;
$$;

create table if not exists nyang.stock_news_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  sentiment text not null check (sentiment in ('bullish', 'bearish', 'neutral')),
  impact_bps integer not null,
  headline text not null,
  body text not null,
  source text not null default 'gemini',
  channel_id text,
  price_before integer not null check (price_before > 0),
  price_after integer not null check (price_after > 0),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists stock_news_events_created_desc_idx
  on nyang.stock_news_events(created_at desc);

drop function if exists nyang.apply_stock_news_impact(text, integer, text, text, text, text, jsonb);

create or replace function nyang.apply_stock_news_impact(
  p_sentiment text,
  p_impact_bps integer,
  p_headline text,
  p_body text,
  p_source text default 'gemini',
  p_channel_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  out_event_id bigint,
  out_price_before integer,
  out_price_after integer,
  out_signed_impact_bps integer,
  out_bucket_start timestamptz
)
language plpgsql
set search_path = nyang, public
as $$
declare
  v_market nyang.stock_market%rowtype;
  v_sentiment text := lower(trim(coalesce(p_sentiment, 'neutral')));
  v_abs_bps integer := greatest(coalesce(p_impact_bps, 0), 0);
  v_signed_bps integer := 0;
  v_price_delta integer := 0;
  v_price_after integer := 0;
  v_bucket timestamptz;
begin
  perform nyang.sync_stock_market(now());

  select *
  into v_market
  from nyang.stock_market
  where id = 1
  for update;

  if v_sentiment = 'bullish' then
    v_signed_bps := least(v_abs_bps, 5000);
  elsif v_sentiment = 'bearish' then
    v_signed_bps := -least(v_abs_bps, 5000);
  else
    v_sentiment := 'neutral';
    v_signed_bps := 0;
  end if;

  out_price_before := v_market.current_price;
  out_signed_impact_bps := v_signed_bps;

  if v_signed_bps = 0 then
    v_price_after := out_price_before;
  else
    v_price_delta := greatest(
      1,
      round((out_price_before::numeric * abs(v_signed_bps)::numeric) / 10000.0)::integer
    );

    if v_signed_bps > 0 then
      v_price_after := out_price_before + v_price_delta;
    else
      v_price_after := greatest(50, out_price_before - v_price_delta);
    end if;
  end if;

  v_bucket := nyang.stock_bucket_start(now());

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
    out_price_before,
    out_price_before,
    out_price_before,
    out_price_before,
    0,
    0
  )
  on conflict (bucket_start) do nothing;

  update nyang.stock_candles
  set
    high_price = greatest(high_price, v_price_after),
    low_price = least(low_price, v_price_after),
    close_price = v_price_after
  where bucket_start = v_bucket;

  update nyang.stock_market
  set
    current_price = v_price_after,
    updated_at = now()
  where id = 1;

  insert into nyang.stock_news_events(
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
    out_signed_impact_bps,
    coalesce(nullif(trim(p_headline), ''), '시장 뉴스'),
    coalesce(nullif(trim(p_body), ''), '시장에 큰 변동은 없습니다.'),
    coalesce(nullif(trim(p_source), ''), 'gemini'),
    p_channel_id,
    out_price_before,
    v_price_after,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into out_event_id;

  update nyang.app_config
  set
    stock_news_last_sent_at = now(),
    stock_news_force_run_at = null
  where id = 1;

  out_price_after := v_price_after;
  out_bucket_start := v_bucket;
  return next;
end;
$$;
