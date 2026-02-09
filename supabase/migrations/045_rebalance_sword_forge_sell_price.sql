create or replace function nyang.compute_sword_sell_price(
  p_level integer
)
returns integer
language plpgsql
immutable
as $$
declare
  v_level integer := greatest(0, p_level);
  v_total_spent numeric;
  v_recovery_rate numeric;
begin
  if v_level < 5 then
    return 0;
  end if;

  v_total_spent := (300 * v_level)
    + (70 * v_level * (v_level - 1))
    + (2 * v_level * (v_level - 1) * ((2 * v_level) - 1));

  v_recovery_rate := least(2.10, 1.20 + ((v_level - 5) * 0.08));

  return floor(v_total_spent * v_recovery_rate)::integer;
end;
$$;
