-- Add extra configuration columns for bot customization
ALTER TABLE nyang.app_config 
  ADD COLUMN IF NOT EXISTS bot_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS bot_sync_interval_ms INTEGER NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS gacha_embed_color TEXT NOT NULL DEFAULT '#5865F2',
  ADD COLUMN IF NOT EXISTS gacha_embed_title TEXT NOT NULL DEFAULT '🎰 가챠 뽑기';

-- Update existing config if it doesn't have these
UPDATE nyang.app_config 
SET 
  bot_sync_interval_ms = 5000,
  gacha_embed_color = '#5865F2',
  gacha_embed_title = '🎰 가챠 뽑기'
WHERE id = 1 AND gacha_embed_title IS NULL;
