import { type Client, type Message, EmbedBuilder } from 'discord.js';

import { getBotContext } from '../context.js';
import { handleRpsMessage } from '../games/rps.js';
import { handleWordChainMessage, startWordChain } from '../games/wordchain.js';
import { setGame } from '../games/state.js';
import { inferIntentFromGroq } from '../services/groq.js';
import { triggerGachaUI } from '../commands/draw.js';
import { handleError } from '../errorHandler.js';

import { generateInventoryEmbed } from '../services/inventory.js';

function isMentionOrReplyToBot(message: Message, botUserId: string): boolean {
  if (message.mentions.has(botUserId)) return true;
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

    if (await handleRpsMessage(message)) return;
    if (await handleWordChainMessage(message)) return;

    try {
      const { data } = await ctx.supabase.rpc('grant_chat_points', {
        p_discord_user_id: message.author.id,
        p_channel_id: message.channelId,
        p_message_length: message.content.trim().length,
        p_message_ts: new Date(message.createdTimestamp).toISOString(),
        p_message_id: message.id
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
    } catch (e) {}

    const botId = client.user?.id;
    if (!botId) return;
    if (!isMentionOrReplyToBot(message, botId)) return;

    const text = message.content.replaceAll(`<@${botId}>`, '').trim();

    try {
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
          const errMsg = e instanceof Error ? e.message : '인벤토리 조회 실패';
          await message.reply(errMsg);
        }
        return;
      }

      if ('sendTyping' in message.channel) {
        await message.channel.sendTyping();
      }
      const intent = await inferIntentFromGroq({ userId: message.author.id, text });
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
          case 'topics':
            await message.reply('주제 추천:\n- 요즘 빠진 게임/음악\n- 올해 가고 싶은 여행지\n- 최근 본 영화/드라마\n- 최애 음식/라면 조합');
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
