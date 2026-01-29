import { EmbedBuilder } from 'discord.js';
import { Kazagumo, type KazagumoTrack } from 'kazagumo';
import { Connectors, Constants } from 'shoukaku';

import type { Client } from 'discord.js';
import type { Env } from '../lib/env.js';
import { getBotContext } from '../context.js';
import { buildMusicPanelImage } from '../lib/musicPanelImage.js';
import { buildMusicSetupEmbed, buildMusicSetupRows } from '../lib/musicSetupUi.js';
import { getAppConfig } from './config.js';

type RequesterLike = { id: string; username?: string };

let musicInstance: Kazagumo | null = null;
let musicClient: Client | null = null;

const parseRequesterId = (requester: unknown): string | null => {
  if (!requester || typeof requester !== 'object') return null;
  if (!('id' in requester)) return null;
  return String((requester as RequesterLike).id);
};

export const formatDuration = (ms: number | null | undefined): string => {
  if (!ms || ms <= 0) return 'LIVE';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => value.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};

export const buildTrackEmbed = (title: string, track: KazagumoTrack): EmbedBuilder => {
  const requesterId = parseRequesterId(track.requester);
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(`[${track.title}](${track.uri})`)
    .setColor(0x3b82f6)
    .addFields(
      { name: '아티스트', value: track.author || '알 수 없음', inline: true },
      { name: '길이', value: formatDuration(track.length), inline: true },
      { name: '요청자', value: requesterId ? `<@${requesterId}>` : '알 수 없음', inline: true }
    );

  if (track.thumbnail) {
    embed.setThumbnail(track.thumbnail);
  }

  return embed;
};

export const updateMusicSetupMessage = async (
  player: {
    guildId: string;
    textId?: string | null;
    position?: number;
    queue: { current?: KazagumoTrack | null; slice: (start?: number, end?: number) => KazagumoTrack[] };
  },
  trackOverride?: KazagumoTrack | null
) => {
  if (!musicClient) return;
  const config = await getAppConfig().catch(() => null);
  if (!config?.music_command_channel_id || !config.music_setup_message_id) return;

  const channel = await musicClient.channels.fetch(config.music_command_channel_id).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;

  const message = await channel.messages.fetch(config.music_setup_message_id).catch(() => null);
  if (!message) return;

  const current = trackOverride === undefined ? player.queue.current : trackOverride;

  const embed = buildMusicSetupEmbed(config, config.music_command_channel_id);
  const rows = buildMusicSetupRows();

  if (!current) {
    await message.edit({ embeds: [embed], components: rows, attachments: [] });
    return;
  }

  const queueTracks = player.queue.slice(0, 6).map((track) => ({
    title: track.title,
    author: track.author,
    thumbnail: track.thumbnail,
    length: track.length
  }));

  const attachment = await buildMusicPanelImage({
    title: current.title,
    artist: current.author,
    artworkUrl: current.thumbnail,
    durationMs: current.length,
    positionMs: player.position ?? 0,
    queue: queueTracks
  });

  embed.setImage('attachment://music-panel.png');

  await message.edit({ embeds: [embed], files: [attachment], components: rows });
};

const mapTrackState = (track: KazagumoTrack) => ({
  id: track.track,
  title: track.title,
  author: track.author,
  uri: track.uri,
  length: track.length,
  thumbnail: track.thumbnail
});

export const updateMusicState = async (player: {
  guildId: string;
  playing?: boolean;
  paused?: boolean;
  queue: { current?: KazagumoTrack | null; slice: (start?: number, end?: number) => KazagumoTrack[] };
}) => {
  const ctx = getBotContext();
  const queueTracks = player.queue.slice(0);
  if (!player.queue.current) return;
  const current = player.queue.current ? mapTrackState(player.queue.current) : null;
  const queue = queueTracks.map(mapTrackState);
  await ctx.supabase.from('music_state').upsert({
    guild_id: player.guildId,
    current_track: current,
    queue,
    updated_at: new Date().toISOString()
  });
};

export const clearMusicState = async (guildId: string) => {
  const ctx = getBotContext();
  await ctx.supabase.from('music_state').upsert({
    guild_id: guildId,
    current_track: null,
    queue: [],
    updated_at: new Date().toISOString()
  });
};

export const initMusic = (client: Client, env: Env): Kazagumo => {
  if (musicInstance) return musicInstance;
  musicClient = client;

  const nodes = [
    {
      name: 'primary',
      url: `${env.LAVALINK_HOST}:${env.LAVALINK_PORT}`,
      auth: env.LAVALINK_AUTH ?? 'youshallnotpass',
      secure: env.LAVALINK_SECURE
    }
  ];

  musicInstance = new Kazagumo(
    {
      defaultSearchEngine: 'youtube',
      send: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
      }
    },
    new Connectors.DiscordJS(client),
    nodes
  );

  musicInstance.shoukaku.on('ready', (name) => {
    console.log(`[Lavalink] ${name}: ready`);
  });

  musicInstance.shoukaku.on('error', (name, error) => {
    console.error(`[Lavalink] ${name}: error`, error);
  });

  musicInstance.shoukaku.on('debug', (name, info) => {
    console.debug(`[Lavalink] ${name}: debug`, info);
  });

  musicInstance.shoukaku.on('close', (name, code, reason) => {
    console.warn(`[Lavalink] ${name}: closed`, { code, reason });
  });

  musicInstance.shoukaku.on('disconnect', (name, count) => {
    console.warn(`[Lavalink] ${name}: disconnected`, { count });
  });

  musicInstance.on('playerStart', (player, track) => {
    updateMusicSetupMessage(player, track).catch(() => {});
    updateMusicState(player).catch(() => {});
  });

  musicInstance.on('playerCreate', (player) => {
    console.log('[Music] playerCreate', { guildId: player.guildId, voiceId: player.voiceId, textId: player.textId });
  });

  musicInstance.on('playerDestroy', (player) => {
    console.log('[Music] playerDestroy', { guildId: player.guildId, voiceId: player.voiceId, textId: player.textId });
    updateMusicSetupMessage(player, null).catch(() => {});
    clearMusicState(player.guildId).catch(() => {});
  });

  musicInstance.on('playerClosed', (player, data) => {
    console.warn('[Music] playerClosed', { guildId: player.guildId, code: data.code, reason: data.reason });
  });

  musicInstance.on('playerException', (player, data) => {
    console.error('[Music] playerException', { guildId: player.guildId, error: data.exception?.message ?? 'unknown' });
  });

  musicInstance.on('playerStuck', (player, data) => {
    console.warn('[Music] playerStuck', { guildId: player.guildId, thresholdMs: data.thresholdMs });
  });

  musicInstance.on('playerEmpty', (player) => {
    setTimeout(() => {
      if (player.queue.current) return;
      if (player.queue.slice(0).length > 0) return;
      updateMusicSetupMessage(player, null).catch(() => {});
      clearMusicState(player.guildId).catch(() => {});
    }, 1200);
    const channel = player.voiceId ? client.channels.cache.get(player.voiceId) : null;
    if (channel && channel.isVoiceBased()) {
      const nonBotCount = channel.members.filter((member) => !member.user.bot).size;
      console.warn('[Music] playerEmpty', { guildId: player.guildId, voiceId: player.voiceId, nonBotCount });
      if (nonBotCount > 0) return;
    } else {
      console.warn('[Music] playerEmpty', { guildId: player.guildId, voiceId: player.voiceId, nonBotCount: 0 });
    }

    setTimeout(() => {
      const recheck = player.voiceId ? client.channels.cache.get(player.voiceId) : null;
      if (recheck && recheck.isVoiceBased()) {
        const stillPresent = recheck.members.filter((member) => !member.user.bot).size;
        if (stillPresent > 0) return;
      }
      player.destroy().catch(() => {});
    }, 15000);
  });

  musicInstance.on('queueUpdate', (player) => {
    updateMusicState(player).catch(() => {});
  });

  return musicInstance;
};

export const getMusic = (): Kazagumo => {
  if (!musicInstance) throw new Error('Music service not initialized');
  return musicInstance;
};

export const getNodeStatus = (music: Kazagumo) => {
  const nodes = Array.from(music.shoukaku.nodes.values());
  if (!nodes.length) {
    return { ready: false, summary: '연결된 Lavalink 노드가 없습니다.' };
  }

  const connected = nodes.filter((node) => node.state === Constants.State.CONNECTED);
  if (connected.length === 0) {
    const names = nodes.map((node) => node.name).join(', ');
    return { ready: false, summary: `노드 연결 중: ${names}` };
  }

  return { ready: true, summary: `연결됨: ${connected.map((node) => node.name).join(', ')}` };
};
