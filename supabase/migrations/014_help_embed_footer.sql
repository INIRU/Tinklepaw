-- Add footer text and timestamp settings to app_config
-- Schema: nyang

alter table nyang.app_config
add column if not exists help_embed_footer_text text default 'Nyaru Bot',
add column if not exists help_embed_show_timestamp boolean default true;
