CREATE TABLE nyang.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(20) NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  metadata JSONB
);

-- 인덱스 추가
CREATE INDEX idx_notifications_user_id ON nyang.notifications(user_id);
CREATE INDEX idx_notifications_created_at ON nyang.notifications(created_at);
CREATE INDEX idx_notifications_is_read ON nyang.notifications(is_read);
CREATE INDEX idx_notifications_type ON nyang.notifications(type);

-- 알림 타입 제약 조건
ALTER TABLE nyang.notifications ADD CONSTRAINT chk_notification_type 
CHECK (type IN ('info', 'warning', 'success', 'error'));

-- 알림 트리거: 만료된 알림 자동 삭제
CREATE OR REPLACE FUNCTION nyang.cleanup_expired_notifications()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM nyang.notifications WHERE expires_at < NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_expired_notifications
AFTER INSERT ON nyang.notifications
EXECUTE FUNCTION nyang.cleanup_expired_notifications();