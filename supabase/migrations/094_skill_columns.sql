alter table nyang.mc_player_skills
  add column if not exists stone_skin_lv integer not null default 0 check (stone_skin_lv between 0 and 3),
  add column if not exists harvest_fortune_lv integer not null default 0 check (harvest_fortune_lv between 0 and 3);
