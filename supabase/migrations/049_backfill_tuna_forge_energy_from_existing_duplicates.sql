with cfg as (
  select
    greatest(0, coalesce(ac.duplicate_ss_tuna_energy, 3)) as ss_energy,
    greatest(0, coalesce(ac.duplicate_sss_tuna_energy, 5)) as sss_energy
  from nyang.app_config ac
  where ac.id = 1
  union all
  select 3 as ss_energy, 5 as sss_energy
  where not exists (select 1 from nyang.app_config where id = 1)
  limit 1
),
duplicate_energy as (
  select
    inv.discord_user_id,
    sum(
      case
        when it.rarity = 'SS' then greatest(inv.qty - 1, 0) * cfg.ss_energy
        when it.rarity = 'SSS' then greatest(inv.qty - 1, 0) * cfg.sss_energy
        else 0
      end
    )::integer as energy_to_add
  from nyang.inventory inv
  join nyang.items it on it.item_id = inv.item_id
  cross join cfg
  where
    it.rarity in ('SS', 'SSS')
    and inv.qty > 1
  group by inv.discord_user_id
),
eligible as (
  select d.discord_user_id, d.energy_to_add
  from duplicate_energy d
  where
    d.energy_to_add > 0
    and not exists (
      select 1
      from nyang.point_events pe
      where pe.discord_user_id = d.discord_user_id
        and pe.kind = 'forge_energy_backfill_v1'
    )
),
credited as (
  insert into nyang.point_balances(discord_user_id, balance, tuna_forge_energy)
  select e.discord_user_id, 0, e.energy_to_add
  from eligible e
  on conflict (discord_user_id) do update
    set tuna_forge_energy = nyang.point_balances.tuna_forge_energy + excluded.tuna_forge_energy,
        updated_at = now()
  returning discord_user_id
)
insert into nyang.point_events(discord_user_id, kind, amount, meta)
select
  e.discord_user_id,
  'forge_energy_backfill_v1',
  0,
  jsonb_build_object(
    'source', 'inventory_duplicate_backfill',
    'version', 1,
    'energy_delta', e.energy_to_add
  )
from eligible e;
