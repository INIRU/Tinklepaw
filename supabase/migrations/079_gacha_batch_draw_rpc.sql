create or replace function nyang.perform_gacha_draw_batch(
  p_discord_user_id text,
  p_pool_id uuid default null,
  p_amount integer default 1
)
returns table (
  out_item_id uuid,
  out_name text,
  out_rarity nyang.gacha_rarity,
  out_discord_role_id text,
  out_is_free boolean,
  out_refund_points integer,
  out_reward_points integer,
  out_new_balance integer,
  out_is_variant boolean
)
language plpgsql
set search_path = nyang, public
as $$
declare
  v_amount integer := greatest(1, least(100, coalesce(p_amount, 1)));
  v_idx integer;
  v_row record;
begin
  for v_idx in 1..v_amount loop
    begin
      for v_row in
        select *
        from nyang.perform_gacha_draw(p_discord_user_id, p_pool_id)
      loop
        out_item_id := v_row.out_item_id;
        out_name := v_row.out_name;
        out_rarity := v_row.out_rarity;
        out_discord_role_id := v_row.out_discord_role_id;
        out_is_free := v_row.out_is_free;
        out_refund_points := v_row.out_refund_points;
        out_reward_points := v_row.out_reward_points;
        out_new_balance := v_row.out_new_balance;
        out_is_variant := coalesce(v_row.out_is_variant, false);
        return next;
      end loop;
    exception
      when others then
        if v_idx = 1 then
          raise;
        end if;
        exit;
    end;
  end loop;
end;
$$;

grant execute on function nyang.perform_gacha_draw_batch(text, uuid, integer) to service_role;
