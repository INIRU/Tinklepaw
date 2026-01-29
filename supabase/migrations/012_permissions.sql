-- service_role에게 nyang 스키마 및 notifications 테이블 권한 부여
GRANT USAGE ON SCHEMA nyang TO service_role;
GRANT ALL ON TABLE nyang.notifications TO service_role;

-- 혹시 모르니 postgres 역할에도 부여
GRANT USAGE ON SCHEMA nyang TO postgres;
GRANT ALL ON TABLE nyang.notifications TO postgres;

-- authenticated 역할 (일반 로그인 사용자)에게도 부여 (나중에 필요할 수 있음)
GRANT USAGE ON SCHEMA nyang TO authenticated;
GRANT SELECT, UPDATE, DELETE ON TABLE nyang.notifications TO authenticated;