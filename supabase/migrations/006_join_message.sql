alter table app_config
  add column if not exists join_message_channel_id text;
