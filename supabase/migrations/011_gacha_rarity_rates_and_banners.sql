-- Gacha v2: pool kind, fixed rarity enum, per-pool rarity rates, banner.

do $$
begin
  create type nyang.gacha_pool_kind as enum ('permanent', 'limited');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type nyang.gacha_rarity as enum ('R', 'S', 'SS', 'SSS');
exception
  when duplicate_object then null;
end
$$;

alter table nyang.gacha_pools
  add column if not exists kind nyang.gacha_pool_kind not null default 'permanent',
  add column if not exists banner_image_url text,
  add column if not exists rate_r integer not null default 5,
  add column if not exists rate_s integer not null default 75,
  add column if not exists rate_ss integer not null default 17,
  add column if not exists rate_sss integer not null default 3;

-- Keep existing pity column but constrain to supported rarities.
alter table nyang.gacha_pools
  alter column pity_rarity type nyang.gacha_rarity using pity_rarity::nyang.gacha_rarity;

-- Constrain pool rarity rates (must sum to 100).
alter table nyang.gacha_pools
  drop constraint if exists gacha_pools_rate_sum_check;

alter table nyang.gacha_pools
  add constraint gacha_pools_rate_sum_check check (rate_r + rate_s + rate_ss + rate_sss = 100);

-- Constrain item rarity to the same enum.
alter table nyang.items
  alter column rarity type nyang.gacha_rarity using rarity::nyang.gacha_rarity;
