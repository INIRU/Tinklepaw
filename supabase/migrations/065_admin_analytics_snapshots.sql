create table if not exists nyang.admin_analytics_snapshots (
  snapshot_key text primary key,
  range_days integer not null check (range_days >= 30 and range_days <= 365),
  channel_id text,
  generated_at timestamptz not null,
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_admin_analytics_snapshots_generated_at
  on nyang.admin_analytics_snapshots (generated_at desc);

create index if not exists idx_admin_analytics_snapshots_filters
  on nyang.admin_analytics_snapshots (range_days, channel_id, generated_at desc);

alter table nyang.admin_analytics_snapshots enable row level security;

drop policy if exists admin_analytics_snapshots_service_role_all on nyang.admin_analytics_snapshots;
create policy admin_analytics_snapshots_service_role_all
  on nyang.admin_analytics_snapshots
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on table nyang.admin_analytics_snapshots to service_role;
