-- Allow admins to grant personal roles to users without requiring server boost
alter table nyang.app_config
  add column if not exists personal_role_granted_user_ids text[] not null default '{}';

comment on column nyang.app_config.personal_role_granted_user_ids
  is 'Discord user IDs allowed to have personal roles without boosting';
