CREATE TABLE IF NOT EXISTS nyang.music_state (
  guild_id text PRIMARY KEY,
  current_track jsonb,
  queue jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS music_state_updated_idx ON nyang.music_state (updated_at DESC);
