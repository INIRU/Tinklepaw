alter table nyang.app_config
  add column if not exists stock_holding_fee_force_run_at timestamptz;
