-- notifications 테이블에 보상 관련 컬럼 추가
ALTER TABLE nyang.notifications 
ADD COLUMN reward_points INTEGER DEFAULT 0,
ADD COLUMN reward_item_id UUID REFERENCES nyang.items(item_id) ON DELETE SET NULL,
ADD COLUMN reward_item_qty INTEGER DEFAULT 0,
ADD COLUMN is_reward_claimed BOOLEAN DEFAULT false;

-- 보상 수령 처리를 위한 함수
CREATE OR REPLACE FUNCTION nyang.claim_notification_reward(
  p_notification_id UUID,
  p_user_id TEXT
) RETURNS JSONB AS $$
DECLARE
  v_notification RECORD;
  v_result JSONB;
BEGIN
  -- 알림 조회 및 잠금
  SELECT * INTO v_notification
  FROM nyang.notifications
  WHERE id = p_notification_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Notification not found');
  END IF;

  IF v_notification.is_reward_claimed THEN
    RETURN jsonb_build_object('success', false, 'message', 'Reward already claimed');
  END IF;

  IF (v_notification.reward_points IS NULL OR v_notification.reward_points = 0) AND 
     (v_notification.reward_item_id IS NULL OR v_notification.reward_item_qty = 0) THEN
    RETURN jsonb_build_object('success', false, 'message', 'No reward to claim');
  END IF;

  -- 포인트 지급
  IF v_notification.reward_points > 0 THEN
    PERFORM nyang.admin_adjust_points(p_user_id, v_notification.reward_points, 'Notification Reward: ' || v_notification.title);
  END IF;

  -- 아이템 지급
  IF v_notification.reward_item_id IS NOT NULL AND v_notification.reward_item_qty > 0 THEN
    INSERT INTO nyang.inventory (discord_user_id, item_id, qty)
    VALUES (p_user_id, v_notification.reward_item_id, v_notification.reward_item_qty)
    ON CONFLICT (discord_user_id, item_id)
    DO UPDATE SET qty = inventory.qty + EXCLUDED.qty, updated_at = NOW();
  END IF;

  -- 수령 상태 업데이트
  UPDATE nyang.notifications
  SET is_reward_claimed = true, is_read = true
  WHERE id = p_notification_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;