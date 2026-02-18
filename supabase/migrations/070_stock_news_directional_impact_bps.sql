alter table nyang.app_config
  add column if not exists stock_news_bullish_min_impact_bps integer not null default 40,
  add column if not exists stock_news_bullish_max_impact_bps integer not null default 260,
  add column if not exists stock_news_bearish_min_impact_bps integer not null default 40,
  add column if not exists stock_news_bearish_max_impact_bps integer not null default 260;

update nyang.app_config
set
  stock_news_bullish_min_impact_bps = coalesce(stock_news_min_impact_bps, 40),
  stock_news_bullish_max_impact_bps = coalesce(stock_news_max_impact_bps, 260),
  stock_news_bearish_min_impact_bps = coalesce(stock_news_min_impact_bps, 40),
  stock_news_bearish_max_impact_bps = coalesce(stock_news_max_impact_bps, 260);

alter table nyang.app_config
  drop constraint if exists app_config_stock_news_directional_impact_bounds_check;

alter table nyang.app_config
  add constraint app_config_stock_news_directional_impact_bounds_check
  check (
    stock_news_bullish_min_impact_bps between 0 and 5000
    and stock_news_bullish_max_impact_bps between 0 and 5000
    and stock_news_bullish_max_impact_bps >= stock_news_bullish_min_impact_bps
    and stock_news_bearish_min_impact_bps between 0 and 5000
    and stock_news_bearish_max_impact_bps between 0 and 5000
    and stock_news_bearish_max_impact_bps >= stock_news_bearish_min_impact_bps
  );
