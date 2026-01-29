alter table nyang.app_config
  add column if not exists persona_prompt text,
  add column if not exists reward_emoji_enabled boolean not null default true;
