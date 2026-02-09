alter table if exists nyang.app_config
  add column if not exists voice_interface_trigger_channel_id text,
  add column if not exists voice_interface_category_id text;

create table if not exists nyang.voice_room_templates (
  discord_user_id text primary key,
  room_name text not null,
  user_limit integer not null default 0 check (user_limit >= 0 and user_limit <= 99),
  rtc_region text,
  is_locked boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists nyang.voice_auto_rooms (
  channel_id text primary key,
  owner_discord_user_id text not null,
  category_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_voice_auto_rooms_owner
  on nyang.voice_auto_rooms(owner_discord_user_id);
