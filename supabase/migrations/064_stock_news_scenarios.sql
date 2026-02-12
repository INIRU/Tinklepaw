alter table nyang.app_config
  add column if not exists stock_news_bullish_scenarios text[] not null default array[
    '차세대 제품 쇼케이스 기대감 확산',
    '대형 파트너십 체결 루머 확산',
    '핵심 엔지니어 팀 합류 소식',
    '기관성 매수세 유입 추정',
    '해외 커뮤니티에서 기술력 재평가'
  ]::text[],
  add column if not exists stock_news_bearish_scenarios text[] not null default array[
    '생산 라인 점검 이슈 부각',
    '핵심 부품 수급 지연 우려 확대',
    '경영진 발언 해석 논란 확산',
    '단기 차익 실현 물량 집중',
    '경쟁사 공세 심화 관측'
  ]::text[];
