alter table if exists nyang.music_state
  add column if not exists voice_channel_id text null,
  add column if not exists text_channel_id text null,
  add column if not exists autoplay_enabled boolean not null default true,
  add column if not exists filter_preset text not null default 'off',
  add column if not exists volume integer not null default 60;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'music_state_filter_preset_check'
      and conrelid = 'nyang.music_state'::regclass
  ) then
    alter table nyang.music_state
      add constraint music_state_filter_preset_check
      check (filter_preset in ('off', 'bass_boost', 'nightcore', 'vaporwave', 'karaoke'));
  end if;
end $$;

alter table nyang.music_state
  alter column volume set default 60;
