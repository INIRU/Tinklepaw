-- Dev seed (safe defaults + placeholder pool/items)

-- Prefer the project schema when present.
create schema if not exists nyang;
set search_path to nyang, public;

insert into app_config(
  id,
  guild_id,
  admin_role_ids,
  reward_points_per_interval,
  reward_interval_seconds,
  reward_daily_cap_points,
  reward_min_message_length,
  server_intro,
  banner_image_url,
  icon_image_url
)
values (
  1,
  '0',
  '{}',
  10,
  180,
  null,
  3,
  '🔔 딸랑- 귀여운 고양이들이 쉬어가는 곳, [방울냥]\n\n❝ 말하지 않아도 괜찮아요, 그냥 곁에 머물러만 주세요 ❞\n\n✨ 우리 서버의 매력\n- 듣방/잠수 200% 환영: 마이크 끄고 타자만 쳐도, 듣기만 해도 OK!\n- 쾌적한 환경: 부스트 3레벨과 고음질통화, 모든특전 활성화(‘참치캔’ 태그보유)\n- 자유로운 소통: 게임 잡담, 밈 공유, 일상 수다까지\n\n📝 입장 방법\n- #자기소개 30초만 슥- 작성하면 바로 입장 완료!',
  null,
  null
)
on conflict (id) do nothing;

-- Placeholder items (discord_role_id is null until you map real roles)
insert into items(name, rarity, discord_role_id, duplicate_refund_points)
values
  ('Test Role A', 'R', null, 10),
  ('Test Role B', 'SSR', null, 50)
on conflict do nothing;

-- Create a default pool if none exists
do $$
declare
  v_pool_id uuid;
  v_a uuid;
  v_b uuid;
begin
  select pool_id into v_pool_id from gacha_pools where name = 'default' limit 1;
  if v_pool_id is null then
    insert into gacha_pools(
      name,
      is_active,
      cost_points,
      paid_pull_cooldown_seconds,
      free_pull_interval_seconds,
      pity_threshold,
      pity_rarity
    )
    values (
      'default',
      true,
      50,
      0,
      86400,
      10,
      'SSR'
    )
    returning pool_id into v_pool_id;
  end if;

  select item_id into v_a from items where name = 'Test Role A' limit 1;
  select item_id into v_b from items where name = 'Test Role B' limit 1;

  if v_a is not null then
    insert into gacha_pool_items(pool_id, item_id, weight)
    values (v_pool_id, v_a, 90)
    on conflict (pool_id, item_id) do update set weight = excluded.weight;
  end if;

  if v_b is not null then
    insert into gacha_pool_items(pool_id, item_id, weight)
    values (v_pool_id, v_b, 10)
    on conflict (pool_id, item_id) do update set weight = excluded.weight;
  end if;
end $$;
