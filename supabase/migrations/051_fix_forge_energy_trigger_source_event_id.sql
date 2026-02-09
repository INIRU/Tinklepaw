create or replace function nyang.grant_tuna_forge_energy_on_duplicate_refund()
returns trigger
language plpgsql
set search_path = nyang, public
as $$
declare
  v_item_id uuid;
  v_rarity nyang.gacha_rarity;
  v_ss_energy integer := 3;
  v_sss_energy integer := 5;
  v_gain integer := 0;
begin
  begin
    v_item_id := nullif(new.meta ->> 'item_id', '')::uuid;
  exception
    when others then
      return new;
  end;

  if v_item_id is null then
    return new;
  end if;

  select i.rarity
  into v_rarity
  from nyang.items i
  where i.item_id = v_item_id;

  if v_rarity not in ('SS', 'SSS') then
    return new;
  end if;

  select
    greatest(0, coalesce(ac.duplicate_ss_tuna_energy, 3)),
    greatest(0, coalesce(ac.duplicate_sss_tuna_energy, 5))
  into v_ss_energy, v_sss_energy
  from nyang.app_config ac
  where ac.id = 1;

  if v_rarity = 'SSS' then
    v_gain := v_sss_energy;
  elsif v_rarity = 'SS' then
    v_gain := v_ss_energy;
  end if;

  if v_gain <= 0 then
    return new;
  end if;

  insert into nyang.point_balances(discord_user_id, balance, tuna_forge_energy)
  values (new.discord_user_id, 0, v_gain)
  on conflict (discord_user_id) do update
    set tuna_forge_energy = nyang.point_balances.tuna_forge_energy + excluded.tuna_forge_energy,
        updated_at = now();

  insert into nyang.point_events(discord_user_id, kind, amount, meta)
  values (
    new.discord_user_id,
    'forge_energy_grant',
    0,
    jsonb_build_object(
      'source_kind', new.kind,
      'source_event_id', new.id,
      'item_id', v_item_id,
      'rarity', v_rarity::text,
      'energy_delta', v_gain
    )
  );

  return new;
end;
$$;
