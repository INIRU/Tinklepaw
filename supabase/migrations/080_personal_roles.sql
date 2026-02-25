-- Personal roles: maps server boosters to their personal Discord roles
create table if not exists nyang.personal_roles (
  discord_user_id  text primary key,
  discord_role_id  text not null unique,
  created_at       timestamptz not null default now()
);

-- Ensure columns exist (safe for re-runs and pre-existing tables)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'nyang' and table_name = 'personal_roles' and column_name = 'color_type'
  ) then
    alter table nyang.personal_roles
      add column color_type text not null default 'solid';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'nyang' and table_name = 'personal_roles' and column_name = 'color_secondary'
  ) then
    alter table nyang.personal_roles
      add column color_secondary integer not null default 0;
  end if;
end
$$;

-- Add check constraint if missing
do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_schema = 'nyang' and constraint_name = 'personal_roles_color_type_check'
  ) then
    alter table nyang.personal_roles
      add constraint personal_roles_color_type_check
      check (color_type in ('solid', 'gradient', 'hologram'));
  end if;
end
$$;

comment on table nyang.personal_roles is 'Maps server boosters to their customisable personal Discord role';

-- Add anchor role setting to app_config
alter table nyang.app_config
  add column if not exists personal_role_anchor_id text default null;

comment on column nyang.app_config.personal_role_anchor_id
  is 'Discord role ID below which new personal roles are positioned';
