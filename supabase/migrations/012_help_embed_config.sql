-- Add help embed configuration to app_config
-- Schema: nyang

alter table nyang.app_config
add column if not exists help_embed_title text default '💕 방울냥 봇 도움말',
add column if not exists help_embed_color text default '#FF69B4',
add column if not exists help_embed_description text default '사용 가능한 명령어 목록이야!',
add column if not exists help_embed_fields jsonb default '[
  {"name": "/뽑기", "value": "가챠를 돌려 역할을 뽑아봐!", "inline": true},
  {"name": "/가방", "value": "보유한 아이템 목록을 확인해.", "inline": true},
  {"name": "/장착 [이름]", "value": "아이템을 장착하고 역할을 받아.", "inline": false},
  {"name": "/해제", "value": "장착 중인 아이템을 해제해.", "inline": true},
  {"name": "대화하기", "value": "나(방울냥)를 멘션하거나 답장하면 대화할 수 있어!", "inline": false},
  {"name": "미니게임", "value": "\"가위바위보\" 또는 \"끝말잇기\"라고 말해봐!", "inline": true}
]'::jsonb;
