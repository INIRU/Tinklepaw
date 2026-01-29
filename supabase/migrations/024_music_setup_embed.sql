ALTER TABLE nyang.app_config
  ADD COLUMN IF NOT EXISTS music_setup_embed_title TEXT,
  ADD COLUMN IF NOT EXISTS music_setup_embed_description TEXT;
