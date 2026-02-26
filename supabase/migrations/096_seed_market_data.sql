-- Step 2: Insert seed items (separate transaction so enum value is committed first)
insert into nyang.mc_market_items (symbol, display_name, category, base_price, min_price, max_price, mc_material) values
  ('wheat_seeds',       '밀 씨앗',       'seed',  3,  1,  8,  'WHEAT_SEEDS'),
  ('melon_seeds',       '수박 씨앗',     'seed',  3,  1,  8,  'MELON_SEEDS'),
  ('pumpkin_seeds',     '호박 씨앗',     'seed',  4,  2,  10, 'PUMPKIN_SEEDS'),
  ('beetroot_seeds',    '비트루트 씨앗', 'seed',  4,  2,  10, 'BEETROOT_SEEDS'),
  ('torchflower_seeds', '횃불꽃 씨앗',   'seed', 15,  7,  38, 'TORCHFLOWER_SEEDS'),
  ('pitcher_pod',       '투수 꼬투리',   'seed', 20, 10,  50, 'PITCHER_POD')
on conflict (symbol) do nothing;

-- Init prices for seed items
insert into nyang.mc_market_prices (symbol, current_price, change_pct)
select symbol, base_price, 0
from nyang.mc_market_items
where category = 'seed'
on conflict (symbol) do nothing;
