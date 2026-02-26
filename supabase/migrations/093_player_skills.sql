create table nyang.mc_player_skills (
  minecraft_uuid   text primary key references nyang.minecraft_players(minecraft_uuid) on delete cascade,
  skill_points     integer not null default 0,
  mining_speed_lv  integer not null default 0 check (mining_speed_lv between 0 and 3),
  lucky_strike_lv  integer not null default 0 check (lucky_strike_lv between 0 and 3),
  wide_harvest_lv  integer not null default 0 check (wide_harvest_lv between 0 and 1),
  wide_plant_lv    integer not null default 0 check (wide_plant_lv between 0 and 1),
  freshness_lv     integer not null default 0 check (freshness_lv between 0 and 3),
  updated_at       timestamptz not null default now()
);
