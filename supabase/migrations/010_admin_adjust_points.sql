create or replace function nyang.admin_adjust_points(
  p_discord_user_id text,
  p_amount integer,
  p_reason text default ''
)
returns integer
language plpgsql
set search_path = nyang, public
as $$
declare
  v_balance integer;
begin
  perform nyang.ensure_user(p_discord_user_id);

  insert into nyang.point_events(discord_user_id, kind, amount, meta)
  values (p_discord_user_id, 'admin_adjust', p_amount, jsonb_build_object('reason', p_reason));

  update nyang.point_balances
    set balance = balance + p_amount,
        updated_at = now()
    where discord_user_id = p_discord_user_id
    returning balance into v_balance;

  return v_balance;
end;
$$;

grant execute on function nyang.admin_adjust_points(text, integer, text) to service_role;
