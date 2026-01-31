-- Add "variant" (변동) mechanic.
-- If a non-SSS result is rolled, it can upgrade to SSS with probability = rate_sss / 2.

set search_path = nyang, public;

alter table gacha_pull_results
  add column if not exists is_variant boolean not null default false;

drop function if exists nyang.perform_gacha_draw(text, uuid);

create or replace function nyang.perform_gacha_draw(
  p_discord_user_id text,
  p_pool_id uuid default null
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
  v_pool gacha_pools%rowtype;
  v_state gacha_user_state%rowtype;
  v_now timestamptz := now();
  v_free_ok boolean := false;
  v_paid_ok boolean := true;
  v_spend integer := 0;
  v_refund integer := 0;
  v_reward_points integer := 0;
  v_balance integer := 0;
  v_item record;
  v_pull_id uuid;
  v_current_qty integer := 0;
  v_force_rarity boolean := false;
  v_rarity nyang.gacha_rarity;
  v_base_rarity nyang.gacha_rarity;
  v_roll integer;
  v_variant_prob numeric;
  v_has_sss boolean := false;
begin
  perform ensure_user(p_discord_user_id);

  if p_pool_id is null then
    select * into v_pool
    from gacha_pools
    where
      is_active = true
      and (start_at is null or start_at <= v_now)
      and (end_at is null or end_at > v_now)
    order by created_at asc
    limit 1;
  else
    select * into v_pool
    from gacha_pools
    where
      pool_id = p_pool_id
      and is_active = true
      and (start_at is null or start_at <= v_now)
      and (end_at is null or end_at > v_now);
  end if;

  if not found then
    raise exception 'NO_ACTIVE_POOL';
  end if;

  insert into gacha_user_state(discord_user_id, pool_id)
  values (p_discord_user_id, v_pool.pool_id)
  on conflict (discord_user_id, pool_id) do nothing;

  select * into v_state
  from gacha_user_state
  where discord_user_id = p_discord_user_id and pool_id = v_pool.pool_id
  for update;

  if v_pool.free_pull_interval_seconds is not null then
    v_free_ok := (v_state.free_available_at is null) or (v_state.free_available_at <= v_now);
  end if;

  v_paid_ok := (v_state.paid_available_at is null) or (v_state.paid_available_at <= v_now);

  if v_free_ok then
    out_is_free := true;
    v_spend := 0;
  else
    out_is_free := false;
    if not v_paid_ok then
      raise exception 'PAID_COOLDOWN';
    end if;
    v_spend := greatest(v_pool.cost_points, 0);
  end if;

  select balance into v_balance from point_balances where discord_user_id = p_discord_user_id for update;
  if (not out_is_free) and v_balance < v_spend then
    raise exception 'INSUFFICIENT_POINTS';
  end if;

  if v_pool.pity_threshold is not null and v_pool.pity_rarity is not null then
    if v_state.pity_counter >= greatest(v_pool.pity_threshold - 1, 0) then
      v_force_rarity := true;
    end if;
  end if;

  if v_force_rarity then
    v_rarity := v_pool.pity_rarity;
  else
    v_roll := floor(random() * 100)::integer + 1;
    if v_roll <= v_pool.rate_r then
      v_rarity := 'R';
    elsif v_roll <= v_pool.rate_r + v_pool.rate_s then
      v_rarity := 'S';
    elsif v_roll <= v_pool.rate_r + v_pool.rate_s + v_pool.rate_ss then
      v_rarity := 'SS';
    else
      v_rarity := 'SSS';
    end if;
  end if;

  v_base_rarity := v_rarity;

  out_is_variant := false;
  -- Temporary boost: variant roll probability equals SSS rate.
  v_variant_prob := greatest(coalesce(v_pool.rate_sss, 0), 0) / 100;

  if v_rarity <> 'SSS' and v_variant_prob > 0 then
    select exists (
      select 1
      from gacha_pool_items gpi
      join items i on i.item_id = gpi.item_id
      where
        gpi.pool_id = v_pool.pool_id
        and i.is_active = true
        and i.is_equippable = true
        and gpi.weight > 0
        and i.rarity = 'SSS'
      limit 1
    ) into v_has_sss;

    if v_has_sss and random() < v_variant_prob then
      v_rarity := 'SSS';
      out_is_variant := true;
    end if;
  end if;

  with candidates as (
    select
      i.item_id,
      i.name,
      i.rarity,
      i.discord_role_id,
      i.duplicate_refund_points,
      i.reward_points,
      gpi.weight
    from gacha_pool_items gpi
    join items i on i.item_id = gpi.item_id
    where
      gpi.pool_id = v_pool.pool_id
      and i.is_active = true
      and i.is_equippable = true
      and gpi.weight > 0
      and i.rarity = v_rarity
  ),
  weighted as (
    select
      c.*,
      sum(c.weight) over () as total_weight,
      sum(c.weight) over (order by c.item_id) as cum_weight
    from candidates c
  ),
  choice as (
    select *
    from weighted
    where cum_weight >= (random() * total_weight)
    order by cum_weight asc
    limit 1
  )
  select * into v_item from choice;

  if v_item is null then
    -- If variant was requested but pool has no SSS candidates, fall back to original rarity (non-variant).
    if out_is_variant then
      out_is_variant := false;
      v_rarity := v_base_rarity;

      with candidates as (
        select
          i.item_id,
          i.name,
          i.rarity,
          i.discord_role_id,
          i.duplicate_refund_points,
          i.reward_points,
          gpi.weight
        from gacha_pool_items gpi
        join items i on i.item_id = gpi.item_id
        where
          gpi.pool_id = v_pool.pool_id
          and i.is_active = true
          and i.is_equippable = true
          and gpi.weight > 0
          and i.rarity = v_rarity
      ),
      weighted as (
        select
          c.*,
          sum(c.weight) over () as total_weight,
          sum(c.weight) over (order by c.item_id) as cum_weight
        from candidates c
      ),
      choice as (
        select *
        from weighted
        where cum_weight >= (random() * total_weight)
        order by cum_weight asc
        limit 1
      )
      select * into v_item from choice;
    end if;
  end if;

  if v_item is null then
    -- fallback: any rarity
    out_is_variant := false;
    with candidates as (
      select
        i.item_id,
        i.name,
        i.rarity,
        i.discord_role_id,
        i.duplicate_refund_points,
        i.reward_points,
        gpi.weight
      from gacha_pool_items gpi
      join items i on i.item_id = gpi.item_id
      where
        gpi.pool_id = v_pool.pool_id
        and i.is_active = true
        and i.is_equippable = true
        and gpi.weight > 0
    ),
    weighted as (
      select
        c.*,
        sum(c.weight) over () as total_weight,
        sum(c.weight) over (order by c.item_id) as cum_weight
      from candidates c
    ),
    choice as (
      select *
      from weighted
      where cum_weight >= (random() * total_weight)
      order by cum_weight asc
      limit 1
    )
    select * into v_item from choice;
  end if;

  if v_item is null then
    raise exception 'POOL_EMPTY';
  end if;

  if v_item.discord_role_id is null then
    v_reward_points := greatest(coalesce(v_item.reward_points, 0), 0);
    v_refund := 0;
  else
    select qty into v_current_qty
    from inventory
    where discord_user_id = p_discord_user_id and item_id = v_item.item_id;

    if coalesce(v_current_qty, 0) > 0 then
      v_refund := greatest(coalesce(v_item.duplicate_refund_points, 0), 0);
    else
      v_refund := 0;
    end if;
  end if;

  insert into gacha_pulls(discord_user_id, pool_id, is_free, spent_points)
  values (p_discord_user_id, v_pool.pool_id, out_is_free, v_spend)
  returning pull_id into v_pull_id;

  insert into gacha_pull_results(pull_id, item_id, qty, is_pity, is_variant)
  values (v_pull_id, v_item.item_id, 1, v_force_rarity, out_is_variant)
  on conflict (pull_id, item_id) do update set qty = gacha_pull_results.qty + 1;

  if v_item.discord_role_id is not null then
    insert into inventory(discord_user_id, item_id, qty)
    values (p_discord_user_id, v_item.item_id, 1)
    on conflict (discord_user_id, item_id) do update
      set qty = inventory.qty + 1,
          updated_at = now();
  end if;

  if (not out_is_free) and v_spend <> 0 then
    insert into point_events(discord_user_id, kind, amount, meta)
    values (p_discord_user_id, 'gacha_spend', -v_spend, jsonb_build_object('pool_id', v_pool.pool_id, 'pull_id', v_pull_id));
    update point_balances
      set balance = balance - v_spend,
          updated_at = now()
    where discord_user_id = p_discord_user_id;
  end if;

  if v_refund <> 0 then
    insert into point_events(discord_user_id, kind, amount, meta)
    values (p_discord_user_id, 'duplicate_refund', v_refund, jsonb_build_object('item_id', v_item.item_id, 'pull_id', v_pull_id));
    update point_balances
      set balance = balance + v_refund,
          updated_at = now()
    where discord_user_id = p_discord_user_id;
  end if;

  if v_reward_points <> 0 then
    insert into point_events(discord_user_id, kind, amount, meta)
    values (p_discord_user_id, 'gacha_reward', v_reward_points, jsonb_build_object('item_id', v_item.item_id, 'pull_id', v_pull_id));
    update point_balances
      set balance = balance + v_reward_points,
          updated_at = now()
    where discord_user_id = p_discord_user_id;
  end if;

  if out_is_free and v_pool.free_pull_interval_seconds is not null then
    update gacha_user_state
      set free_available_at = v_now + make_interval(secs => v_pool.free_pull_interval_seconds),
          updated_at = now()
      where discord_user_id = p_discord_user_id and pool_id = v_pool.pool_id;
  elsif (not out_is_free) and v_pool.paid_pull_cooldown_seconds is not null and v_pool.paid_pull_cooldown_seconds > 0 then
    update gacha_user_state
      set paid_available_at = v_now + make_interval(secs => v_pool.paid_pull_cooldown_seconds),
          updated_at = now()
      where discord_user_id = p_discord_user_id and pool_id = v_pool.pool_id;
  else
    update gacha_user_state
      set updated_at = now()
      where discord_user_id = p_discord_user_id and pool_id = v_pool.pool_id;
  end if;

  if v_pool.pity_threshold is not null and v_pool.pity_rarity is not null then
    if v_item.rarity = v_pool.pity_rarity then
      update gacha_user_state
        set pity_counter = 0
        where discord_user_id = p_discord_user_id and pool_id = v_pool.pool_id;
    else
      update gacha_user_state
        set pity_counter = pity_counter + 1
        where discord_user_id = p_discord_user_id and pool_id = v_pool.pool_id;
    end if;
  end if;

  select balance into v_balance from point_balances where discord_user_id = p_discord_user_id;

  out_item_id := v_item.item_id;
  out_name := v_item.name;
  out_rarity := v_item.rarity;
  out_discord_role_id := v_item.discord_role_id;
  out_refund_points := v_refund;
  out_reward_points := v_reward_points;
  out_new_balance := v_balance;
  return next;
end;
$$;
