-- Add last_heartbeat_at column to app_config
ALTER TABLE nyang.app_config 
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;
