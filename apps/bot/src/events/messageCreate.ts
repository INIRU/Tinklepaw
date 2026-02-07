import { type Client, type Message } from 'discord.js';

import { getBotContext } from '../context.js';
import { handleRpsMessage } from '../games/rps.js';
import { handleWordChainMessage, startWordChain } from '../games/wordchain.js';
import { setGame } from '../games/state.js';
import { inferIntentFromGemini } from '../services/gemini.js';
import { triggerGachaUI } from '../commands/draw.js';
import { handleError } from '../errorHandler.js';
import { getAppConfig } from '../services/config.js';
import { getMusic, getNodeStatus, updateMusicSetupMessage, updateMusicState } from '../services/music.js';
import { isSpotifyQuery, normalizeMusicQuery, searchTracksWithFallback } from '../services/musicSearch.js';

import { generateInventoryEmbed } from '../services/inventory.js';
import { getChannelMentions } from '../services/channelCache.js';
import type { Json } from '@nyaru/core';

function isMentionOrReplyToBot(message: Message, botUserId: string): boolean {
  const content = message.content.trimStart();
  if (content.startsWith(`<@${botUserId}>`) || content.startsWith(`<@!${botUserId}>`)) return true;
  const ref = message.reference;
  if (!ref?.messageId) return false;
  const replied = message.channel.messages.cache.get(ref.messageId);
  return replied?.author?.id === botUserId;
}

export function registerMessageCreate(client: Client) {
  client.on('messageCreate', async (message: Message) => {
    const ctx = getBotContext();

    if (!message.guildId || message.guildId !== ctx.env.NYARU_GUILD_ID) return;
    if (message.author.bot) return;
    if (!message.content) return;
    const guildId = message.guildId;

    if (await handleRpsMessage(message)) return;
    if (await handleWordChainMessage(message)) return;

    try {
      const isBooster = Boolean(message.member?.premiumSinceTimestamp);
      const { data } = await ctx.supabase.rpc('grant_chat_points', {
        p_discord_user_id: message.author.id,
        p_channel_id: message.channelId,
        p_message_length: message.content.trim().length,
        p_message_ts: new Date(message.createdTimestamp).toISOString(),
        p_message_id: message.id,
        p_is_booster: isBooster
      });

      // eslint-disable-next-line no-console
      console.log(`[Points] Channel: ${message.channelId}, User: ${message.author.id}, Result:`, data);

      const results = Array.isArray(data) ? data : [data];
      const earned = results.find((r) => r && r.granted_points > 0);
      if (earned) {
        // 이모지 반응 설정 확인
        const { data: config } = await ctx.supabase
          .from('app_config')
          .select('reward_emoji_enabled')
          .single();
        
        if (config?.reward_emoji_enabled !== false) {
          await message.react('💰'); 
        }
      }
    } catch (e) {
      console.error('[Points] Failed to grant chat points:', e);
    }

    const musicConfig = await getAppConfig().catch(() => null);
    if (musicConfig?.music_command_channel_id && message.channelId === musicConfig.music_command_channel_id) {
      const query = normalizeMusicQuery(message.content);
      if (!query) return;

      const logMusicAction = async (
        status: 'requested' | 'success' | 'failed',
        actionMessage: string,
        payload: Json = {}
      ) => {
        await ctx.supabase.from('music_control_logs').insert({
          guild_id: guildId,
          action: 'add',
          status,
          message: actionMessage,
          payload,
          requested_by: message.author.id
        });
      };

      await logMusicAction('requested', 'Discord music channel message add requested.', {
        source: 'discord_message',
        query
      });

      const voiceId = message.member?.voice?.channelId;
      if (!voiceId) {
        await logMusicAction('failed', 'Music add failed: user not in voice channel.', {
          source: 'discord_message',
          query
        });
        await message.reply('🎧 먼저 음성 채널에 들어와줘.');
        return;
      }

      if (isSpotifyQuery(query)) {
        await logMusicAction('failed', 'Music add failed: Spotify URL unsupported.', {
          source: 'discord_message',
          query
        });
        await message.reply('🚫 Spotify URL은 아직 지원하지 않아. YouTube나 SoundCloud 링크를 써줘.');
        return;
      }

      const music = getMusic();
      const nodeStatus = getNodeStatus(music);
      if (!nodeStatus.ready) {
        await logMusicAction('failed', 'Music add failed: Lavalink not ready.', {
          source: 'discord_message',
          query,
          node_summary: nodeStatus.summary
        });
        await message.reply(`🚫 Lavalink 연결 상태를 확인해줘.\n${nodeStatus.summary}`);
        return;
      }

      const player = await music.createPlayer({
        guildId,
        textId: musicConfig.music_command_channel_id,
        voiceId,
        volume: 60
      });

      if (player.voiceId && player.voiceId !== voiceId) {
        await logMusicAction('failed', 'Music add failed: user in different voice channel.', {
          source: 'discord_message',
          query,
          user_voice_id: voiceId,
          player_voice_id: player.voiceId
        });
        await message.reply('🚫 현재 음악이 재생 중인 음성 채널에서만 추가할 수 있어.');
        return;
      }

      const searchResult = await searchTracksWithFallback(music, query, {
        id: message.author.id,
        username: message.author.username,
        displayName: message.member?.displayName ?? message.author.globalName ?? message.author.username,
        avatarUrl: message.author.displayAvatarURL({ extension: 'png', size: 128 }),
        source: 'discord_message'
      });

      if (!searchResult.result.tracks.length) {
        await logMusicAction('failed', 'Music add failed: no search results.', {
          source: 'discord_message',
          query,
          fallback_used: searchResult.fallbackUsed,
          fallback_query: searchResult.fallbackQuery
        });
        await message.reply('🔎 검색 결과가 없어. URL이면 자동 보정 검색도 시도했지만 실패했어.');
        return;
      }

      const fallbackSuffix = searchResult.fallbackUsed && searchResult.fallbackQuery
        ? ` (자동 보정: ${searchResult.fallbackQuery})`
        : '';

      if (searchResult.result.type === 'PLAYLIST') {
        player.queue.add(searchResult.result.tracks);
        await logMusicAction('success', `Playlist added via Discord message (${searchResult.result.tracks.length} tracks).`, {
          source: 'discord_message',
          query,
          fallback_used: searchResult.fallbackUsed,
          fallback_query: searchResult.fallbackQuery,
          count: searchResult.result.tracks.length
        });
        await message.reply(`📚 **${searchResult.result.playlistName ?? '플레이리스트'}** ${searchResult.result.tracks.length}곡을 추가했어.${fallbackSuffix}`);
      } else {
        const track = searchResult.result.tracks[0];
        player.queue.add(track);
        await logMusicAction('success', `${track.title} added via Discord message.`, {
          source: 'discord_message',
          query,
          track_id: track.track,
          fallback_used: searchResult.fallbackUsed,
          fallback_query: searchResult.fallbackQuery
        });
        await message.reply(`➕ **${track.title}** 을(를) 대기열에 추가했어.${fallbackSuffix}`);
      }

      if (!player.playing && !player.paused) {
        await player.play();
      }

      await updateMusicSetupMessage(player, player.queue.current ?? null).catch(() => {});
      await updateMusicState(player).catch(() => {});
      return;
    }

    const botId = client.user?.id;
    if (!botId) return;
    if (!isMentionOrReplyToBot(message, botId)) return;

    const text = message.content.replace(new RegExp(`^\s*<@!?${botId}>\s*`), '').trim();
    if (!text) {
      await message.reply('할 말 있어? 메시지를 같이 보내줘.');
      return;
    }

    try {
      if (
        (text.includes('채팅방') || text.includes('채널') || text.includes('채팅')) &&
        (text.includes('어디') || text.includes('어느') || text.includes('어디로'))
      ) {
        const mentions = getChannelMentions(ctx.env.NYARU_GUILD_ID, 5);
        if (mentions.length > 0) {
          await message.reply(`여기서 하면 돼: ${mentions.join(' ')}`);
        } else {
          await message.reply('채널 정보를 아직 못 가져왔어. 잠깐 뒤에 다시 물어봐.');
        }
        return;
      }

      if (text.includes('가위바위보')) {
        setGame(message.channelId, { kind: 'rps', userId: message.author.id, startedAt: Date.now() });
        await message.reply('가위바위보! 가위/바위/보 중에서 골라줘. (그만/종료로 종료)');
        return;
      }
      if (text.includes('끝말잇기')) {
        await startWordChain(message.channelId, message.author.id, (t) => message.reply(t));
        return;
      }
      if (text.includes('뽑기') || text.includes('가챠')) {
        await triggerGachaUI(message);
        return;
      }
      if (text.includes('인벤')) {
        try {
          const embed = await generateInventoryEmbed(ctx, message.author);
          await message.reply({ embeds: [embed] });
        } catch (e) {
          console.error('[MessageCreate] Failed to fetch inventory (keyword):', e);
          const errMsg = e instanceof Error ? e.message : '인벤토리 조회 실패';
          await message.reply(errMsg);
        }
        return;
      }

      if ('sendTyping' in message.channel) {
        await message.channel.sendTyping();
      }
      const intent = await inferIntentFromGemini({ userId: message.author.id, text });
      if (intent) {
        switch (intent.action) {
          case 'game_rps':
            setGame(message.channelId, { kind: 'rps', userId: message.author.id, startedAt: Date.now() });
            await message.reply('가위바위보! 가위/바위/보 중에서 골라줘. (그만/종료로 종료)');
            return;
          case 'game_wordchain':
            await startWordChain(message.channelId, message.author.id, (t) => message.reply(t));
            return;
          case 'draw':
          case 'draw10':
            await triggerGachaUI(message);
            return;
          case 'inventory': {
            try {
              const embed = await generateInventoryEmbed(ctx, message.author);
              await message.reply({ embeds: [embed] });
            } catch (e) {
              console.error('[MessageCreate] Failed to fetch inventory (intent):', e);
              const errMsg = e instanceof Error ? e.message : '인벤토리 조회 실패';
              await message.reply(errMsg);
            }
            return;
          }
          case 'equip':
            const { data: item } = await ctx.supabase.from('items').select('item_id').eq('name', intent.itemName).eq('is_active', true).single();
            if (!item) {
              await message.reply('그 이름의 아이템을 못 찾았어.');
              return;
            }
            const { error: equipErr } = await ctx.supabase.rpc('set_equipped_item', { p_discord_user_id: message.author.id, p_item_id: item.item_id });
            await message.reply(equipErr ? `장착 실패: ${equipErr.message}` : `장착 요청 완료: **${intent.itemName}**`);
            return;
          case 'unequip':
            const { error: unequipErr } = await ctx.supabase.rpc('set_equipped_item', { p_discord_user_id: message.author.id, p_item_id: null });
            await message.reply(unequipErr ? `해제 실패: ${unequipErr.message}` : '해제 요청 완료.');
            return;
          case 'points':
            const { data: balanceData } = await ctx.supabase.from('point_balances').select('balance').eq('discord_user_id', message.author.id).single();
            await message.reply(`현재 포인트: **${balanceData?.balance ?? 0}p**`);
            return;
        case 'chat':
          await message.reply(intent.reply);
          return;
      }
      }

      await message.reply('무엇을 할까? (뽑기/인벤/장착/끝말잇기/가위바위보)');
    } catch (e) {
      await handleError(e, message);
    }
  });
}
