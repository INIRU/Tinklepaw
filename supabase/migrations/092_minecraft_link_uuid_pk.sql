-- Change minecraft_link_requests to OTP-first flow:
-- Request is created with only minecraft_uuid (Discord ID unknown until confirm step)

-- Drop old FK and PK constraints
ALTER TABLE nyang.minecraft_link_requests DROP CONSTRAINT IF EXISTS minecraft_link_requests_discord_user_id_fkey;
ALTER TABLE nyang.minecraft_link_requests DROP CONSTRAINT IF EXISTS minecraft_link_requests_pkey;

-- Make discord_user_id nullable
ALTER TABLE nyang.minecraft_link_requests ALTER COLUMN discord_user_id DROP NOT NULL;

-- Set minecraft_uuid as primary key
ALTER TABLE nyang.minecraft_link_requests ADD PRIMARY KEY (minecraft_uuid);

-- Unique index on otp for fast lookup during confirm
CREATE UNIQUE INDEX IF NOT EXISTS minecraft_link_requests_otp_key ON nyang.minecraft_link_requests(otp);
