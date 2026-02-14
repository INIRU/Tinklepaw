import { EmbedBuilder } from 'discord.js';
import { Kazagumo, type KazagumoTrack } from 'kazagumo';
import { Connectors, Constants } from 'shoukaku';
import type { Json } from '@nyaru/core';

import type { Client } from 'discord.js';
import type { Env } from '../lib/env.js';
import { getBotContext } from '../context.js';
import { buildMusicPanelImage } from '../lib/musicPanelImage.js';
import { buildMusicSetupEmbed, buildMusicSetupRows } from '../lib/musicSetupUi.js';
import { getAppConfig } from './config.js';
import { searchTracksWithFallback } from './musicSearch.js';

type RequesterLike = {
  id?: unknown;
  username?: unknown;
  displayName?: unknown;
  avatarUrl?: unknown;
  avatarURL?: unknown;
  source?: unknown;
};

type RequesterState = {
  id: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  source: string | null;
};

type StoredTrackState = {
  id?: unknown;
  title?: unknown;
  author?: unknown;
  uri?: unknown;
  position_ms?: unknown;
  is_playing?: unknown;
  is_paused?: unknown;
  requester?: unknown;
};

type StoredMusicStateRow = {
  current_track: Json | null;
  queue: Json | null;
  voice_channel_id: string | null;
  text_channel_id: string | null;
  autoplay_enabled: boolean | null;
  filter_preset: string | null;
  volume: number | null;
};

export type MusicFilterPreset = 'off' | 'bass_boost' | 'nightcore' | 'vaporwave' | 'karaoke';

export const MUSIC_FILTER_LABELS: Record<MusicFilterPreset, string> = {
  off: '필터 해제',
  bass_boost: 'Bass Boost',
  nightcore: 'Nightcore',
  vaporwave: 'Vaporwave',
  karaoke: 'Karaoke'
};

let musicInstance: Kazagumo | null = null;
let musicClient: Client | null = null;

const asString = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

const asStoredTrack = (value: unknown): StoredTrackState | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as StoredTrackState;
};

const mapRequesterState = (requester: unknown): RequesterState | null => {
  if (!requester || typeof requester !== 'object') return null;
  const value = requester as RequesterLike;
  const id = asString(value.id);
  const username = asString(value.username);
  const displayName = asString(value.displayName);
  const avatarUrl = asString(value.avatarUrl) ?? asString(value.avatarURL);
  const source = asString(value.source);

  if (!id && !username && !displayName) return null;
  return { id, username, displayName, avatarUrl, source };
};

const parseRequesterId = (requester: unknown): string | null => {
  return mapRequesterState(requester)?.id ?? null;
};

const getRequesterName = (requester: unknown): string => {
  const parsed = mapRequesterState(requester);
  return parsed?.displayName ?? parsed?.username ?? '알 수 없음';
};

const getMusicFilterPreset = (player: { data?: Map<string, unknown> }): MusicFilterPreset => {
  const value = player.data?.get('music_filter_preset');
  if (value === 'bass_boost' || value === 'nightcore' || value === 'vaporwave' || value === 'karaoke') {
    return value;
  }
  return 'off';
};

const parseMusicFilterPreset = (value: unknown): MusicFilterPreset => {
  if (value === 'bass_boost' || value === 'nightcore' || value === 'vaporwave' || value === 'karaoke') {
    return value;
  }
  return 'off';
};

const isMusicAutoplayEnabled = (player: { data?: Map<string, unknown> }) => player.data?.get('music_autoplay') !== false;

const setMusicRuntimeDefaults = (player: { data?: Map<string, unknown> }) => {
  if (!player.data) return;
  if (!player.data.has('music_autoplay')) {
    player.data.set('music_autoplay', true);
  }
  if (!player.data.has('music_filter_preset')) {
    player.data.set('music_filter_preset', 'off');
  }
};

const normalizeVolume = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 60;
  return Math.max(1, Math.min(150, Math.floor(value)));
};

const buildRestoreRequester = (requester: unknown, fallbackId: string) => {
  const mapped = mapRequesterState(requester);
  return {
    id: mapped?.id ?? fallbackId,
    username: mapped?.username ?? mapped?.displayName ?? 'restore',
    displayName: mapped?.displayName ?? mapped?.username ?? '세션 복구',
    avatarUrl: mapped?.avatarUrl ?? undefined,
    source: mapped?.source ?? 'restore'
  };
};

const buildRestoreQuery = (track: StoredTrackState): string | null => {
  const uri = asString(track.uri);
  if (uri) return uri;

  const title = asString(track.title);
  const author = asString(track.author);
  if (title && author) return `${title} ${author}`;
  if (title) return title;
  return null;
};

const resolveRestoredTrack = async (
  music: Kazagumo,
  track: StoredTrackState,
  index: number,
): Promise<KazagumoTrack | null> => {
  const query = buildRestoreQuery(track);
  if (!query) return null;

  const requester = buildRestoreRequester(track.requester, `restore-${index}`);
  const result = await searchTracksWithFallback(music, query, requester);
  if (!result.result.tracks.length) return null;

  const storedId = asString(track.id);
  const storedUri = asString(track.uri);
  if (storedId) {
    const exact = result.result.tracks.find((candidate) => candidate.track === storedId);
    if (exact) return exact;
  }

  if (storedUri) {
    const byUri = result.result.tracks.find((candidate) => candidate.uri === storedUri);
    if (byUri) return byUri;
  }

  return result.result.tracks[0] ?? null;
};

export const applyMusicFilterPreset = async (
  player: { shoukaku: { clearFilters: () => Promise<void>; setEqualizer: (bands: Array<{ band: number; gain: number }>) => Promise<void>; setTimescale: (timescale?: { speed?: number; pitch?: number; rate?: number }) => Promise<void>; setKaraoke: (karaoke?: { level?: number; monoLevel?: number; filterBand?: number; filterWidth?: number }) => Promise<void> }; data?: Map<string, unknown> },
  preset: MusicFilterPreset,
) => {
  await player.shoukaku.clearFilters();

  if (preset === 'bass_boost') {
    const gains = [0.25, 0.2, 0.16, 0.1, 0.05, 0, -0.02, -0.02, 0, 0.04, 0.06, 0.08, 0.08, 0.07, 0.06];
    await player.shoukaku.setEqualizer(gains.map((gain, band) => ({ band, gain })));
  } else if (preset === 'nightcore') {
    await player.shoukaku.setTimescale({ speed: 1.12, pitch: 1.12, rate: 1.02 });
  } else if (preset === 'vaporwave') {
    await player.shoukaku.setTimescale({ speed: 0.85, pitch: 0.82, rate: 0.95 });
  } else if (preset === 'karaoke') {
    await player.shoukaku.setKaraoke({ level: 1, monoLevel: 1, filterBand: 220, filterWidth: 120 });
  }

  player.data?.set('music_filter_preset', preset);
};

const logAutoplay = async (
  guildId: string,
  status: 'success' | 'failed',
  message: string,
  payload: Json = {}
) => {
  const ctx = getBotContext();
  await ctx.supabase.from('music_control_logs').insert({
    guild_id: guildId,
    action: 'autoplay',
    status,
    message,
    payload,
    requested_by: null
  });
};

const tryAutoplayFromSeed = async (player: Kazagumo['players'] extends Map<string, infer P> ? P : never) => {
  if (!musicInstance || !isMusicAutoplayEnabled(player)) {
    return false;
  }

  const seed = player.queue.current ?? player.getPrevious();
  if (!seed) {
    return false;
  }

  const query = [seed.title, seed.author].filter((value) => typeof value === 'string' && value.trim().length > 0).join(' ').trim();
  if (!query) {
    return false;
  }

  const search = await musicInstance.search(query, {
    requester: {
      id: 'autoplay',
      username: 'Autoplay',
      displayName: 'Autoplay',
      avatarUrl: null,
      source: 'autoplay'
    }
  });

  if (!search.tracks.length) {
    await logAutoplay(player.guildId, 'failed', '자동재생 검색 결과가 없습니다.', { query });
    return false;
  }

  const candidate = search.tracks.find((track) => track.track !== seed.track) ?? search.tracks[0];
  player.queue.add(candidate);
  if (!player.playing && !player.paused) {
    await player.play();
  }

  await updateMusicSetupMessage(player, player.queue.current ?? candidate).catch(() => {});
  await updateMusicState(player).catch(() => {});
  await logAutoplay(player.guildId, 'success', `${candidate.title} 자동재생`, {
    seed_track: seed.title,
    query,
    track_id: candidate.track
  });
  return true;
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
    data?: Map<string, unknown>;
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
    length: track.length,
    requesterName: getRequesterName(track.requester),
    requesterAvatarUrl: mapRequesterState(track.requester)?.avatarUrl ?? null
  }));

  const filterPreset = getMusicFilterPreset(player);
  const autoplayEnabled = isMusicAutoplayEnabled(player);

  const attachment = await buildMusicPanelImage({
    title: current.title,
    artist: current.author,
    artworkUrl: current.thumbnail,
    durationMs: current.length,
    positionMs: player.position ?? 0,
    queue: queueTracks,
    autoplayEnabled,
    filterLabel: MUSIC_FILTER_LABELS[filterPreset]
  });

  embed.setImage('attachment://music-panel.png');

  await message.edit({ embeds: [embed], files: [attachment], components: rows });
};

const mapTrackState = (
  track: KazagumoTrack,
  options?: {
    positionMs?: number;
    isPlaying?: boolean;
    isPaused?: boolean;
  } | number
) => {
  const metadata = typeof options === 'object' && options !== null
    ? options
    : undefined;

  return {
  id: track.track,
  title: track.title,
  author: track.author,
  uri: track.uri,
  length: track.length,
  thumbnail: track.thumbnail,
  requester: mapRequesterState(track.requester),
  ...(typeof metadata?.positionMs === 'number' ? { position_ms: Math.max(0, Math.floor(metadata.positionMs)) } : {}),
  ...(typeof metadata?.isPlaying === 'boolean' ? { is_playing: metadata.isPlaying } : {}),
  ...(typeof metadata?.isPaused === 'boolean' ? { is_paused: metadata.isPaused } : {})
  };
};

export const updateMusicState = async (player: {
  guildId: string;
  voiceId?: string | null;
  textId?: string | null;
  volume?: number;
  data?: Map<string, unknown>;
  playing?: boolean;
  paused?: boolean;
  position?: number;
  queue: { current?: KazagumoTrack | null; slice: (start?: number, end?: number) => KazagumoTrack[] };
}) => {
  const ctx = getBotContext();
  const queueTracks = player.queue.slice(0);
  if (!player.queue.current) return;
  const positionMs = typeof player.position === 'number' && Number.isFinite(player.position)
    ? Math.max(0, Math.floor(player.position))
    : 0;
  const current = player.queue.current
    ? mapTrackState(player.queue.current, {
      positionMs,
      isPlaying: player.playing === true,
      isPaused: player.paused === true
    })
    : null;
  const queue = queueTracks.map((track) => mapTrackState(track));
  await ctx.supabase.from('music_state').upsert({
    guild_id: player.guildId,
    current_track: current,
    queue,
    voice_channel_id: player.voiceId ?? null,
    text_channel_id: player.textId ?? null,
    autoplay_enabled: isMusicAutoplayEnabled(player),
    filter_preset: getMusicFilterPreset(player),
    volume: normalizeVolume(player.volume),
    updated_at: new Date().toISOString()
  });
};

export const clearMusicState = async (guildId: string) => {
  const ctx = getBotContext();
  await ctx.supabase.from('music_state').upsert({
    guild_id: guildId,
    current_track: null,
    queue: [],
    voice_channel_id: null,
    text_channel_id: null,
    autoplay_enabled: true,
    filter_preset: 'off',
    volume: 60,
    updated_at: new Date().toISOString()
  });
};

export const restoreMusicSession = async (client: Client): Promise<void> => {
  const ctx = getBotContext();
  const music = getMusic();

  const { data, error } = await ctx.supabase
    .from('music_state')
    .select('current_track, queue, voice_channel_id, text_channel_id, autoplay_enabled, filter_preset, volume')
    .eq('guild_id', ctx.env.NYARU_GUILD_ID)
    .maybeSingle();

  if (error) {
    console.warn('[Music] failed to load state for restore', error);
    return;
  }

  const state = (data ?? null) as StoredMusicStateRow | null;
  if (!state?.current_track) {
    return;
  }

  const voiceChannelId = asString(state.voice_channel_id);
  const textChannelId = asString(state.text_channel_id);
  if (!voiceChannelId || !textChannelId) {
    return;
  }

  const voiceChannel = await client.channels.fetch(voiceChannelId).catch(() => null);
  if (!voiceChannel || !voiceChannel.isVoiceBased()) {
    return;
  }

  const listeners = voiceChannel.members.filter((member) => !member.user.bot).size;
  if (listeners < 1) {
    return;
  }

  const current = asStoredTrack(state.current_track);
  const queue = Array.isArray(state.queue)
    ? state.queue.map((item) => asStoredTrack(item)).filter((item): item is StoredTrackState => item !== null)
    : [];
  const persistedTracks = [current, ...queue].filter((item): item is StoredTrackState => item !== null).slice(0, 25);
  if (persistedTracks.length < 1) {
    return;
  }

  const player = await music.createPlayer({
    guildId: ctx.env.NYARU_GUILD_ID,
    textId: textChannelId,
    voiceId: voiceChannelId,
    volume: normalizeVolume(state.volume),
  });

  player.data.set('music_autoplay', state.autoplay_enabled !== false);
  const preset = parseMusicFilterPreset(state.filter_preset);
  await applyMusicFilterPreset(player, preset).catch((applyError) => {
    console.warn('[Music] failed to apply restored filter preset', applyError);
  });

  player.queue.clear();
  const restoredTracks: KazagumoTrack[] = [];
  for (let index = 0; index < persistedTracks.length; index += 1) {
    const restored = await resolveRestoredTrack(music, persistedTracks[index], index).catch(() => null);
    if (restored) {
      restoredTracks.push(restored);
    }
  }

  if (restoredTracks.length < 1) {
    console.warn('[Music] no tracks restored from persisted state');
    return;
  }

  player.queue.add(restoredTracks);
  if (!player.playing && !player.paused) {
    await player.play();
  }

  await updateMusicSetupMessage(player, player.queue.current ?? restoredTracks[0]).catch(() => {});
  await updateMusicState(player).catch(() => {});
  await ctx.supabase.from('music_control_logs').insert({
    guild_id: ctx.env.NYARU_GUILD_ID,
    action: 'restore_session',
    status: 'success',
    message: `${restoredTracks.length}곡 복구 완료`,
    payload: {
      restored_count: restoredTracks.length,
      filter_preset: preset,
      autoplay_enabled: state.autoplay_enabled !== false,
      voice_channel_id: voiceChannelId,
    },
    requested_by: null,
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
    nodes,
    {
      reconnectTries: Number.MAX_SAFE_INTEGER,
      reconnectInterval: 5
    }
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
    setMusicRuntimeDefaults(player);
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
      void (async () => {
        if (player.queue.current) return;
        if (player.queue.slice(0).length > 0) return;
        updateMusicSetupMessage(player, null).catch(() => {});
        clearMusicState(player.guildId).catch(() => {});

        const channel = player.voiceId ? client.channels.cache.get(player.voiceId) : null;
        if (channel && channel.isVoiceBased()) {
          const nonBotCount = channel.members.filter((member) => !member.user.bot).size;
          console.warn('[Music] playerEmpty', { guildId: player.guildId, voiceId: player.voiceId, nonBotCount });

          if (nonBotCount > 0) {
            const autoplayPlayed = await tryAutoplayFromSeed(player).catch((error) => {
              console.warn('[Music] autoplay failed', { guildId: player.guildId, error });
              return false;
            });
            if (autoplayPlayed) return;
            return;
          }
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
      })();
    }, 1200);
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
