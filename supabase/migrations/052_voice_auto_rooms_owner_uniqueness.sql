with ranked as (
  select
    channel_id,
    row_number() over (
      partition by owner_discord_user_id
      order by created_at desc, channel_id desc
    ) as rn
  from nyang.voice_auto_rooms
)
delete from nyang.voice_auto_rooms v
using ranked r
where v.channel_id = r.channel_id
  and r.rn > 1;

create unique index if not exists uq_voice_auto_rooms_owner
  on nyang.voice_auto_rooms(owner_discord_user_id);
