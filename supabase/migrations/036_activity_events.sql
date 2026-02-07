create table if not exists nyang.activity_events (
  event_id bigserial primary key,
  guild_id text not null,
  user_id text null,
  event_type text not null check (event_type in ('member_join', 'member_leave', 'chat_message', 'voice_seconds')),
  value integer not null default 1 check (value >= 0),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_events_guild_created_at
  on nyang.activity_events (guild_id, created_at desc);

create index if not exists idx_activity_events_event_type_created_at
  on nyang.activity_events (event_type, created_at desc);

create index if not exists idx_activity_events_user_created_at
  on nyang.activity_events (user_id, created_at desc)
  where user_id is not null;

grant select, insert, update, delete on table nyang.activity_events to service_role;
grant usage, select on sequence nyang.activity_events_event_id_seq to service_role;
