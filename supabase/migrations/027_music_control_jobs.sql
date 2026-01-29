CREATE TABLE IF NOT EXISTS nyang.music_control_jobs (
  job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  requested_by text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS music_control_jobs_status_idx ON nyang.music_control_jobs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS nyang.music_control_logs (
  log_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  action text NOT NULL,
  status text NOT NULL,
  message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS music_control_logs_time_idx ON nyang.music_control_logs (created_at DESC);
