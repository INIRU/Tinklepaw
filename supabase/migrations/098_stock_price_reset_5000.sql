-- ======================================
-- 098: Stock Price Reset to 5,000P
-- 기존 800만P → 5,000P 리셋
-- 보유자 평단가도 비례 조정
-- ======================================

do $$
declare
  v_old_price integer;
  v_new_price constant integer := 5000;
  v_ratio numeric;
begin
  -- 현재 가격 조회
  select current_price into v_old_price
  from nyang.stock_market where id = 1;

  if v_old_price is null or v_old_price <= 0 then
    raise notice 'No stock market data found, skipping reset';
    return;
  end if;

  v_ratio := v_new_price::numeric / v_old_price::numeric;

  -- 1. 시장 가격 리셋
  update nyang.stock_market
  set current_price = v_new_price,
      updated_at = now()
  where id = 1;

  -- 2. 보유자 평단가 비례 조정
  update nyang.stock_holdings
  set avg_price = greatest(1, round(avg_price * v_ratio)::integer);

  -- 3. 캔들 데이터 비례 조정
  update nyang.stock_candles
  set open_price = greatest(1, round(open_price * v_ratio)::integer),
      high_price = greatest(1, round(high_price * v_ratio)::integer),
      low_price = greatest(1, round(low_price * v_ratio)::integer),
      close_price = greatest(1, round(close_price * v_ratio)::integer);

  raise notice 'Stock price reset: % → % (ratio: %)', v_old_price, v_new_price, v_ratio;
end $$;
