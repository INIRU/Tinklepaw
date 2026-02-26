-- Minecraft ↔ Discord account linking
create table nyang.minecraft_players (
  minecraft_uuid   text primary key,
  discord_user_id  text not null references nyang.users(discord_user_id) on delete cascade,
  minecraft_name   text not null,
  linked_at        timestamptz not null default now()
);
create unique index on nyang.minecraft_players(discord_user_id);

-- OTP linking code temporary storage
create table nyang.minecraft_link_requests (
  discord_user_id  text primary key references nyang.users(discord_user_id),
  otp              text not null,
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now()
);
