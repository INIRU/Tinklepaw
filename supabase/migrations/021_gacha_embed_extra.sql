-- Add columns for intermediate and result gacha embeds
ALTER TABLE nyang.app_config 
  ADD COLUMN IF NOT EXISTS gacha_processing_title TEXT NOT NULL DEFAULT '🎲 뽑는 중...',
  ADD COLUMN IF NOT EXISTS gacha_processing_description TEXT NOT NULL DEFAULT '{drawCount}회 뽑기를 진행하고 있습니다...',
  ADD COLUMN IF NOT EXISTS gacha_result_title TEXT NOT NULL DEFAULT '🎉 {drawCount}회 뽑기 결과';
