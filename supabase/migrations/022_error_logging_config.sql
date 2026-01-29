-- Add error logging configuration to app_config
ALTER TABLE nyang.app_config 
  ADD COLUMN IF NOT EXISTS error_log_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS show_traceback_to_user BOOLEAN NOT NULL DEFAULT true;

-- Create error_logs table to store detailed errors
CREATE TABLE IF NOT EXISTS nyang.error_logs (
  error_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id TEXT,
  command_name TEXT,
  error_message TEXT,
  stack_trace TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for searching
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON nyang.error_logs (created_at DESC);
