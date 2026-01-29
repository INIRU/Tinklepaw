alter table app_config
  add column if not exists banner_image_url text,
  add column if not exists icon_image_url text;
