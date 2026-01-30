alter table nyang.equipped
  add column if not exists equipped_at timestamptz default now();
