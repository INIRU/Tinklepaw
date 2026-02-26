alter table nyang.minecraft_link_requests
  add column if not exists minecraft_uuid text,
  add column if not exists minecraft_name text;
