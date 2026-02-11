alter table nyang.app_config
  add column if not exists lottery_activity_jackpot_rate_pct numeric not null default 10;

create or replace function nyang.accrue_lottery_jackpot_from_activity()
returns trigger
language plpgsql
set search_path = nyang, public
as $$
declare
  v_rate_pct numeric;
  v_delta integer;
begin
  select coalesce(lottery_activity_jackpot_rate_pct, 0)
  into v_rate_pct
  from nyang.app_config
  where id = 1
  for update;

  if not found or v_rate_pct <= 0 then
    return new;
  end if;

  v_delta := floor(greatest(coalesce(new.amount, 0), 0)::numeric * (v_rate_pct / 100.0))::integer;

  if v_delta <= 0 then
    return new;
  end if;

  update nyang.app_config
  set
    lottery_jackpot_pool_points = greatest(0, coalesce(lottery_jackpot_pool_points, 0)) + v_delta,
    updated_at = now()
  where id = 1;

  return new;
end;
$$;

drop trigger if exists trg_accrue_lottery_jackpot_from_activity on nyang.point_events;

create trigger trg_accrue_lottery_jackpot_from_activity
after insert on nyang.point_events
for each row
when (
  new.amount > 0
  and new.kind in ('chat_grant', 'voice_grant', 'daily_chest_claim')
)
execute function nyang.accrue_lottery_jackpot_from_activity();
