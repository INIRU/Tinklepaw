alter table nyang.app_config
  add column if not exists stock_news_signal_duration_rumor_minutes integer not null default 15,
  add column if not exists stock_news_signal_duration_mixed_minutes integer not null default 35,
  add column if not exists stock_news_signal_duration_confirmed_minutes integer not null default 60,
  add column if not exists stock_news_signal_duration_reversal_minutes integer not null default 12,
  add column if not exists stock_news_signal_duration_max_minutes integer not null default 180;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'nyang.app_config'::regclass
      and conname = 'app_config_stock_news_signal_duration_bounds_check'
  ) then
    alter table nyang.app_config
      add constraint app_config_stock_news_signal_duration_bounds_check
      check (
        stock_news_signal_duration_rumor_minutes between 5 and 360
        and stock_news_signal_duration_mixed_minutes between 5 and 360
        and stock_news_signal_duration_confirmed_minutes between 5 and 360
        and stock_news_signal_duration_reversal_minutes between 5 and 180
        and stock_news_signal_duration_max_minutes between 5 and 720
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'nyang.app_config'::regclass
      and conname = 'app_config_stock_news_signal_duration_max_check'
  ) then
    alter table nyang.app_config
      add constraint app_config_stock_news_signal_duration_max_check
      check (
        stock_news_signal_duration_max_minutes >= stock_news_signal_duration_rumor_minutes
        and stock_news_signal_duration_max_minutes >= stock_news_signal_duration_mixed_minutes
        and stock_news_signal_duration_max_minutes >= stock_news_signal_duration_confirmed_minutes
        and stock_news_signal_duration_max_minutes >= stock_news_signal_duration_reversal_minutes
      );
  end if;
end
$$;

create or replace function nyang.apply_stock_news_impact(
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
  v_signal_cap_minutes integer;
  v_signal_base_minutes integer;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_reliability text := lower(coalesce(v_metadata ->> 'reliability_key', 'mixed'));
  v_reversal_raw text := lower(coalesce(v_metadata ->> 'reversal_card_triggered', 'false'));
  v_is_reversal boolean;
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

  v_is_reversal := v_reversal_raw in ('1', 't', 'true', 'y', 'yes', 'on');
  v_signal_cap_minutes := greatest(5, least(720, coalesce(v_cfg.stock_news_signal_duration_max_minutes, 180)));

  if v_is_reversal then
    v_signal_base_minutes := greatest(5, least(180, coalesce(v_cfg.stock_news_signal_duration_reversal_minutes, 12)));
  else
    case v_reliability
      when 'rumor' then
        v_signal_base_minutes := greatest(5, least(360, coalesce(v_cfg.stock_news_signal_duration_rumor_minutes, 15)));
      when 'confirmed' then
        v_signal_base_minutes := greatest(5, least(360, coalesce(v_cfg.stock_news_signal_duration_confirmed_minutes, 60)));
      else
        v_signal_base_minutes := greatest(5, least(360, coalesce(v_cfg.stock_news_signal_duration_mixed_minutes, 35)));
    end case;
  end if;

  v_signal_minutes := greatest(5, least(v_signal_cap_minutes, v_signal_base_minutes));

  v_price_before := v_market.current_price;
  v_price_after := v_market.current_price;
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
    v_metadata
      || jsonb_build_object(
        'mode', 'behavior_signal',
        'signal_until', v_signal_until,
        'signal_minutes', v_signal_minutes,
        'signal_duration_source', case when v_is_reversal then 'reversal' else v_reliability end,
        'signal_duration_max_minutes', v_signal_cap_minutes,
        'signed_impact_bps', v_signed
      )
  )
  returning id into v_event_id;

  return query select v_event_id, v_price_before, v_price_after, v_signed, v_bucket;
end
$$;

grant execute on function nyang.apply_stock_news_impact(text, integer, text, text, text, text, jsonb) to service_role;
