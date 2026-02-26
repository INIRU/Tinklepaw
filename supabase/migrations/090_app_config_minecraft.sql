alter table nyang.app_config
  add column if not exists mc_market_fee_bps integer not null default 500,
  add column if not exists mc_market_event_interval_ms integer not null default 3600000,
  add column if not exists mc_market_channel_id text,
  add column if not exists mc_job_change_cost_points integer not null default 200,
  add column if not exists mc_freshness_decay_minutes integer not null default 30,
  add column if not exists mc_purity_y_bonus_enabled boolean not null default true;
