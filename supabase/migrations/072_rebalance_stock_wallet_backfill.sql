create temporary table stock_wallet_rebalance_old on commit drop as
with old_ledger as (
  select
    discord_user_id,
    least(
      coalesce(
        sum(
          case
            when kind = 'stock_migration_refund'
              and meta->>'source' = 'stock_wallet_split_migration'
            then amount
            else 0
          end
        ),
        0
      )::bigint,
      2147483647
    )::integer as refunded_points,
    least(
      coalesce(
        sum(
          case
            when kind = 'stock_migration_to_nyang'
              and meta->>'source' = 'stock_wallet_split_migration'
              and amount < 0
            then -amount
            else 0
          end
        ),
        0
      )::bigint,
      2147483647
    )::integer as converted_points
  from nyang.point_events
  group by discord_user_id
)
select old_ledger.*
from old_ledger
where (old_ledger.refunded_points > 0 or old_ledger.converted_points > 0)
  and not exists (
    select 1
    from nyang.point_events pe
    where pe.discord_user_id = old_ledger.discord_user_id
      and pe.kind = 'stock_migration_rebalance_old_revert'
      and pe.meta->>'source' = 'stock_wallet_rebalance_v2_fix'
  );

create temporary table stock_wallet_rebalance_targets on commit drop as
select
  discord_user_id,
  greatest(least(coalesce(sum(amount), 0)::bigint, 2147483647), 0)::integer as profit_points
from nyang.point_events
where kind in ('stock_buy_spend', 'stock_sell_gain')
group by discord_user_id
having greatest(least(coalesce(sum(amount), 0)::bigint, 2147483647), 0) > 0;

create temporary table stock_wallet_rebalance_users on commit drop as
select discord_user_id from stock_wallet_rebalance_old
union
select discord_user_id from stock_wallet_rebalance_targets;

insert into nyang.point_balances(discord_user_id, balance)
select discord_user_id, 0
from stock_wallet_rebalance_users
on conflict (discord_user_id) do nothing;

insert into nyang.stock_nyang_balances(discord_user_id, balance)
select discord_user_id, 0
from stock_wallet_rebalance_users
on conflict (discord_user_id) do nothing;

update nyang.point_balances pb
set
  balance = pb.balance - old.refunded_points + old.converted_points,
  updated_at = now()
from stock_wallet_rebalance_old old
where pb.discord_user_id = old.discord_user_id;

update nyang.stock_nyang_balances snb
set
  balance = greatest(0, snb.balance - old.converted_points),
  updated_at = now()
from stock_wallet_rebalance_old old
where snb.discord_user_id = old.discord_user_id;

insert into nyang.point_events(discord_user_id, kind, amount, meta)
select
  old.discord_user_id,
  'stock_migration_rebalance_old_revert',
  0,
  jsonb_build_object(
    'source', 'stock_wallet_rebalance_v2_fix',
    'reverted_refund_points', old.refunded_points,
    'reverted_converted_points', old.converted_points
  )
from stock_wallet_rebalance_old old;

create temporary table stock_wallet_rebalance_apply on commit drop as
select
  target.discord_user_id,
  target.profit_points
from stock_wallet_rebalance_targets target
where not exists (
  select 1
  from nyang.point_events pe
  where pe.discord_user_id = target.discord_user_id
    and pe.kind = 'stock_migration_profit_to_nyang'
    and pe.meta->>'source' in ('stock_wallet_split_migration_v2', 'stock_wallet_rebalance_v2_fix')
);

update nyang.point_balances pb
set
  balance = pb.balance - apply.profit_points,
  updated_at = now()
from stock_wallet_rebalance_apply apply
where pb.discord_user_id = apply.discord_user_id;

update nyang.stock_nyang_balances snb
set
  balance = snb.balance + apply.profit_points,
  updated_at = now()
from stock_wallet_rebalance_apply apply
where snb.discord_user_id = apply.discord_user_id;

insert into nyang.point_events(discord_user_id, kind, amount, meta)
select
  apply.discord_user_id,
  'stock_migration_profit_to_nyang',
  -apply.profit_points,
  jsonb_build_object(
    'source', 'stock_wallet_rebalance_v2_fix',
    'converted_profit_points', apply.profit_points
  )
from stock_wallet_rebalance_apply apply
where apply.profit_points > 0;

insert into nyang.stock_nyang_events(discord_user_id, kind, amount, meta)
select
  apply.discord_user_id,
  'stock_migration_in_v2',
  apply.profit_points,
  jsonb_build_object(
    'source', 'stock_wallet_rebalance_v2_fix',
    'from', 'stock_net_profit',
    'nyang', apply.profit_points
  )
from stock_wallet_rebalance_apply apply
where apply.profit_points > 0;
