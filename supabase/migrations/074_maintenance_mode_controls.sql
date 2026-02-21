alter table nyang.app_config
  add column if not exists maintenance_mode_enabled boolean not null default false,
  add column if not exists maintenance_mode_reason text,
  add column if not exists maintenance_mode_until timestamptz,
  add column if not exists maintenance_web_target_paths text[] not null default '{}'::text[],
  add column if not exists maintenance_bot_target_commands text[] not null default '{}'::text[];

update nyang.app_config
set
  maintenance_mode_enabled = coalesce(maintenance_mode_enabled, false),
  maintenance_mode_reason = nullif(btrim(coalesce(maintenance_mode_reason, '')), ''),
  maintenance_mode_until = maintenance_mode_until,
  maintenance_web_target_paths = coalesce(maintenance_web_target_paths, '{}'::text[]),
  maintenance_bot_target_commands = coalesce(maintenance_bot_target_commands, '{}'::text[]);
