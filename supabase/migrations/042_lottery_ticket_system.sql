create or replace function nyang.play_lottery_ticket(
  p_discord_user_id text
)
returns table (
  out_success boolean,
  out_error_code text,
  out_ticket_price integer,
  out_ticket_number integer,
  out_tier text,
  out_payout integer,
  out_net_change integer,
  out_new_balance integer
)
language plpgsql
set search_path = nyang, public
as $$
declare
  v_ticket_price integer := 500;
  v_balance integer;
  v_roll double precision;
  v_ticket_number integer := floor(random() * 1000000)::integer;
  v_tier text := 'miss';
  v_payout integer := 0;
begin
  perform ensure_user(p_discord_user_id);

  select balance
  into v_balance
  from point_balances
  where discord_user_id = p_discord_user_id
  for update;

  if v_balance is null then
    insert into point_balances(discord_user_id, balance)
    values (p_discord_user_id, 0)
    returning balance into v_balance;
  end if;

  if v_balance < v_ticket_price then
    out_success := false;
    out_error_code := 'INSUFFICIENT_POINTS';
    out_ticket_price := v_ticket_price;
    out_ticket_number := v_ticket_number;
    out_tier := 'none';
    out_payout := 0;
    out_net_change := 0;
    out_new_balance := v_balance;
    return next;
    return;
  end if;

  update point_balances
  set
    balance = balance - v_ticket_price,
    updated_at = now()
  where discord_user_id = p_discord_user_id;

  v_balance := v_balance - v_ticket_price;

  insert into point_events(discord_user_id, kind, amount, meta)
  values (
    p_discord_user_id,
    'lottery_ticket_purchase',
    -v_ticket_price,
    jsonb_build_object(
      'ticket_number', lpad(v_ticket_number::text, 6, '0'),
      'ticket_price', v_ticket_price
    )
  );

  v_roll := random();
  if v_roll < 0.003 then
    v_tier := 'jackpot';
    v_payout := 20000;
  elseif v_roll < 0.018 then
    v_tier := 'gold';
    v_payout := 5000;
  elseif v_roll < 0.098 then
    v_tier := 'silver';
    v_payout := 1500;
  elseif v_roll < 0.298 then
    v_tier := 'bronze';
    v_payout := 700;
  else
    v_tier := 'miss';
    v_payout := 0;
  end if;

  if v_payout > 0 then
    update point_balances
    set
      balance = balance + v_payout,
      updated_at = now()
    where discord_user_id = p_discord_user_id;

    v_balance := v_balance + v_payout;

    insert into point_events(discord_user_id, kind, amount, meta)
    values (
      p_discord_user_id,
      'lottery_ticket_payout',
      v_payout,
      jsonb_build_object(
        'ticket_number', lpad(v_ticket_number::text, 6, '0'),
        'tier', v_tier,
        'roll', v_roll
      )
    );
  end if;

  out_success := true;
  out_error_code := null;
  out_ticket_price := v_ticket_price;
  out_ticket_number := v_ticket_number;
  out_tier := v_tier;
  out_payout := v_payout;
  out_net_change := v_payout - v_ticket_price;
  out_new_balance := v_balance;
  return next;
end;
$$;
