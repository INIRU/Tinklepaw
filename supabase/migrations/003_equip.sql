-- Equip/unequip RPC (single equipped role item)

create or replace function set_equipped_item(
  p_discord_user_id text,
  p_item_id uuid
)
returns table (
  previous_item_id uuid,
  new_item_id uuid,
  previous_role_id text,
  new_role_id text
)
language plpgsql
as $$
declare
  v_prev_item uuid;
  v_prev_role text;
  v_new_role text;
  v_qty integer;
begin
  perform ensure_user(p_discord_user_id);

  select item_id into v_prev_item
  from equipped
  where discord_user_id = p_discord_user_id
  for update;

  if v_prev_item is not null then
    select discord_role_id into v_prev_role from items where item_id = v_prev_item;
  else
    v_prev_role := null;
  end if;

  if p_item_id is not null then
    select qty into v_qty from inventory where discord_user_id = p_discord_user_id and item_id = p_item_id;
    if coalesce(v_qty, 0) <= 0 then
      raise exception 'ITEM_NOT_OWNED';
    end if;

    select discord_role_id into v_new_role
    from items
    where item_id = p_item_id and is_active = true and is_equippable = true;

    if not found then
      raise exception 'ITEM_NOT_EQUIPPABLE';
    end if;
  else
    v_new_role := null;
  end if;

  if v_prev_item is distinct from p_item_id then
    insert into equipped(discord_user_id, item_id)
    values (p_discord_user_id, p_item_id)
    on conflict (discord_user_id) do update
      set item_id = excluded.item_id,
          updated_at = now();

    if v_prev_role is not null and (v_prev_role is distinct from v_new_role) then
      insert into role_sync_jobs(discord_user_id, remove_role_id, reason)
      values (p_discord_user_id, v_prev_role, 'unequip');
    end if;

    if v_new_role is not null and (v_prev_role is distinct from v_new_role) then
      insert into role_sync_jobs(discord_user_id, add_role_id, reason)
      values (p_discord_user_id, v_new_role, 'equip');
    end if;
  end if;

  previous_item_id := v_prev_item;
  new_item_id := p_item_id;
  previous_role_id := v_prev_role;
  new_role_id := v_new_role;
  return next;
end;
$$;
