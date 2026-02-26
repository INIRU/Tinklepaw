create type nyang.mc_job_type as enum ('miner', 'farmer');

create table nyang.minecraft_jobs (
  minecraft_uuid   text primary key references nyang.minecraft_players(minecraft_uuid) on delete cascade,
  job              nyang.mc_job_type not null default 'miner',
  level            integer not null default 1,
  xp               integer not null default 0,
  last_job_change  timestamptz,
  updated_at       timestamptz not null default now()
);
