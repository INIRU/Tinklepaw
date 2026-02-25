import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageActionRowComponentBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from './types.js';
import { getBotContext } from '../context.js';
import { brandEmbed, infoEmbed } from '../lib/embed.js';
import type { Database } from '@nyaru/core';

type Notification = Database['nyang']['Tables']['notifications']['Row'];

export const notificationCommand: SlashCommand = {
  name: '알림',
  json: new SlashCommandBuilder()
    .setName('알림')
    .setNameLocalizations({ ko: '알림' })
    .setDescription('받은 알림을 확인합니다')
    .toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    const ctx = getBotContext();
    await interaction.deferReply({ ephemeral: true });

    try {
      const userId = interaction.user.id;

      // 자신의 알림 목록 가져오기
      const { data: notifications, error } = await ctx.supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(25);

      if (error) throw error;

      if (!notifications || notifications.length === 0) {
        await interaction.editReply({
          embeds: [
            infoEmbed('📭 알림이 없어요', '아직 받은 알림이 없습니다.\n새로운 알림이 오면 여기서 확인할 수 있어!')
              .setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL() })
          ]
        });
        return;
      }

      // 타입별 색상
      const typeColors = {
        info: 0x3498db,
        warning: 0xf39c12,
        success: 0x2ecc71,
        error: 0xe74c3c
      };

      const typeEmojis = {
        info: 'ℹ️',
        warning: '⚠️',
        success: '✅',
        error: '❌'
      };

      // 첫 번째 알림을 기본으로 표시
      const firstNotification = notifications[0] as Notification;
      
      // 보상이 있는지 명확히 확인
      const hasRewardPoints = firstNotification.reward_points && firstNotification.reward_points > 0;
      const hasRewardItem = firstNotification.reward_item_id && firstNotification.reward_item_qty && firstNotification.reward_item_qty > 0;
      const hasReward = hasRewardPoints || hasRewardItem;

      const unreadCount = notifications.filter(n => !n.is_read).length;
      const embed = brandEmbed()
        .setTitle(`${typeEmojis[firstNotification.type] || '📢'} ${firstNotification.title}`)
        .setDescription(firstNotification.content)
        .setColor(typeColors[firstNotification.type] || 0x3498db)
        .setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp(new Date(firstNotification.created_at))
        .setFooter({ text: `📬 1 / ${notifications.length}${unreadCount > 0 ? ` · 읽지 않은 알림 ${unreadCount}개` : ''}` });

      if (hasRewardPoints || hasRewardItem) {
        const rewardText = [];
        if (hasRewardPoints) {
          rewardText.push(`💰 포인트: ${firstNotification.reward_points!.toLocaleString()}P`);
        }
        if (hasRewardItem) {
          // 아이템 이름 가져오기
          const { data: itemData } = await ctx.supabase
            .from('items')
            .select('name')
            .eq('item_id', firstNotification.reward_item_id!)
            .single();
          
          const itemName = itemData?.name || '아이템';
          rewardText.push(`🎁 ${itemName} x${firstNotification.reward_item_qty}`);
        }
        embed.addFields({ 
          name: '🎁 보상', 
          value: rewardText.join('\n'), 
          inline: false 
        });
      }

      if (firstNotification.is_read) {
        embed.setFooter({ text: `1 / ${notifications.length} • 읽음` });
      }

      // 드롭다운 메뉴 생성
      const selectMenuOptions = notifications.slice(0, 25).map((notif, idx) => ({
        label: notif.title.length > 100 ? notif.title.substring(0, 97) + '...' : notif.title,
        description: notif.content.length > 50 ? notif.content.substring(0, 47) + '...' : notif.content,
        value: notif.id,
        emoji: typeEmojis[notif.type] || '📢',
        default: idx === 0
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_notification')
        .setPlaceholder('알림을 선택하세요...')
        .addOptions(selectMenuOptions);

      const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)
      ];

      // 보상이 있고 아직 받지 않았다면 버튼 추가
      if ((hasRewardPoints || hasRewardItem) && !firstNotification.is_reward_claimed) {
        components.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`claim_reward_${firstNotification.id}`)
              .setLabel('보상 받기')
              .setStyle(ButtonStyle.Success)
              .setEmoji('🎁')
          )
        );
      }

      await interaction.editReply({
        embeds: [embed],
        components
      });
    } catch (error) {
      console.error('알림 조회 실패:', error);
      await interaction.editReply('❌ 알림을 불러오지 못했습니다. 다시 시도해주세요.');
    }
  }
};