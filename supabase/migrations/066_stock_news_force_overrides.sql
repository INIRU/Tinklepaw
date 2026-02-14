alter table nyang.app_config
  add column if not exists stock_news_force_sentiment text,
  add column if not exists stock_news_force_tier text,
  add column if not exists stock_news_force_scenario text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_config_stock_news_force_sentiment_check'
  ) then
    alter table nyang.app_config
      add constraint app_config_stock_news_force_sentiment_check
      check (
        stock_news_force_sentiment is null
        or stock_news_force_sentiment in ('bullish', 'bearish', 'neutral')
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_config_stock_news_force_tier_check'
  ) then
    alter table nyang.app_config
      add constraint app_config_stock_news_force_tier_check
      check (
        stock_news_force_tier is null
        or stock_news_force_tier in ('general', 'rare', 'shock')
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_config_stock_news_force_scenario_length_check'
  ) then
    alter table nyang.app_config
      add constraint app_config_stock_news_force_scenario_length_check
      check (
        stock_news_force_scenario is null
        or char_length(stock_news_force_scenario) <= 120
      );
  end if;
end
$$;
