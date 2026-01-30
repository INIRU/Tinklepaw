alter table nyang.gacha_pull_results
  add column if not exists is_pity boolean not null default false;
