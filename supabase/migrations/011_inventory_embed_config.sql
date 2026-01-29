-- Add inventory embed configuration to app_config
-- Schema: nyang

alter table nyang.app_config
add column if not exists inventory_embed_title text default '🎒 인벤토리',
add column if not exists inventory_embed_color text default '#5865F2',
add column if not exists inventory_embed_description text default '{user}님의 인벤토리입니다.\n현재 포인트: **{points}p**';
