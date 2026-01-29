-- Add gacha_embed_description column to app_config
ALTER TABLE nyang.app_config 
  ADD COLUMN IF NOT EXISTS gacha_embed_description TEXT NOT NULL DEFAULT '현재 포인트: **{points}p**\n1회 뽑기 비용: **{cost1}p**\n10회 뽑기 비용: **{cost10}p**{pity}\n\n**확률표 & 획득 가능 역할**\n{rarityDisplay}';
