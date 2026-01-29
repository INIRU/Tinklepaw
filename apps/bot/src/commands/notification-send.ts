import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from './types.js';
import { getBotContext } from '../context.js';
import type { Database } from '@nyaru/core';

type NotificationInsert = Database['nyang']['Tables']['notifications']['Insert'];

export const notificationSendCommand: SlashCommand = {
  name: '알림보내기',
  json: new SlashCommandBuilder()
    .setName('알림보내기')
    .setDescription('공지사항이나 중요 알림을 전송합니다 (관리자용)')
    .addStringOption(option =>
      option.setName('제목')
        .setDescription('알림 제목')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('내용')
        .setDescription('알림 내용')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('타입')
        .setDescription('알림 타입 (정보/경고/성공/오류)')
        .addChoices(
          { name: '정보', value: 'info' },
          { name: '경고', value: 'warning' },
          { name: '성공', value: 'success' },
          { name: '오류', value: 'error' }
        )
    )
    .addUserOption(option =>
      option.setName('사용자')
        .setDescription('알림을 보낼 사용자 (선택)')
    )
    .addStringOption(option =>
      option.setName('만료일')
        .setDescription('알림 만료일 (예: 7d, 30d)')
    )
    .addIntegerOption(option =>
      option.setName('포인트')
        .setDescription('보상 포인트 (선택)')
        .setMinValue(1)
    )
    .addChannelOption(option =>
      option.setName('채널')
        .setDescription('알림을 보낼 채널 (선택, 없으면 DM)')
    )
    .toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    const ctx = getBotContext();
    await interaction.deferReply({ ephemeral: true });

    const title = interaction.options.getString('제목', true);
    const content = interaction.options.getString('내용', true);
    const type = interaction.options.getString('타입') as 'info' | 'warning' | 'success' | 'error' || 'info';
    const targetUser = interaction.options.getUser('사용자');
    const expireOption = interaction.options.getString('만료일');
    const rewardPoints = interaction.options.getInteger('포인트');

    try {
      let expireAt: string | undefined;
      if (expireOption) {
        const days = parseInt(expireOption.replace('d', ''));
        if (isNaN(days)) {
          void interaction.editReply('만료일은 숫자와 "d"로 입력해주세요 (예: 7d)');
          return;
        }
        const expireDate = new Date();
        expireDate.setDate(expireDate.getDate() + days);
        expireAt = expireDate.toISOString();
      }

      const notificationParams = {
        title,
        content,
        type,
        expires_at: expireAt,
        reward_points: rewardPoints || 0,
        reward_item_id: null,
        reward_item_qty: 0
      };

      const hasReward = rewardPoints && rewardPoints > 0;

      // Embed 생성
      const typeColors = {
        info: 0x3498db,
        warning: 0xf39c12,
        success: 0x2ecc71,
        error: 0xe74c3c
      };

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(content)
        .setColor(typeColors[type] || 0x3498db)
        .setTimestamp();

      if (hasReward && rewardPoints) {
        embed.addFields({ 
          name: '🎁 보상', 
          value: `💰 포인트: ${rewardPoints.toLocaleString()}P`, 
          inline: false 
        });
      }

      const channel = interaction.options.getChannel('채널');

      if (targetUser) {
        const insertData: NotificationInsert = {
          user_id: targetUser.id,
          ...notificationParams
        };
        const { data: insertedData, error } = await ctx.supabase
          .from('notifications')
          .insert([insertData])
          .select()
          .single();

        if (error) throw error;

        // 버튼 생성 (보상이 있는 경우)
        const components = hasReward && insertedData
          ? new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`claim_reward_${insertedData.id}`)
                .setLabel('보상 받기')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎁')
            )
          : undefined;

        // 채널이 지정되면 채널에, 아니면 DM으로
        let sent = false;
        if (channel && 'send' in channel && channel.isTextBased()) {
          try {
            await channel.send({
              content: `<@${targetUser.id}>`,
              embeds: [embed],
              components: components ? [components] : undefined
            });
            sent = true;
          } catch (e) {
            console.error('Failed to send to channel:', e);
          }
        }
        
        if (!sent) {
          try {
            await targetUser.send({
              embeds: [embed],
              components: components ? [components] : undefined
            });
            sent = true;
          } catch (e) {
            console.error('Failed to send DM:', e);
            // DM을 받을 수 없는 경우 채널에 보냄
            if (interaction.channel && 'send' in interaction.channel && interaction.channel.isTextBased()) {
              try {
                await interaction.channel.send({
                  content: `<@${targetUser.id}>`,
                  embeds: [embed],
                  components: components ? [components] : undefined
                });
                sent = true;
              } catch (e2) {
                console.error('Failed to send to interaction channel:', e2);
              }
            }
          }
        }

        if (sent) {
          void interaction.editReply(`✅ ${targetUser.username}님에게 알림을 전송했습니다!`);
        } else {
          void interaction.editReply(`❌ 알림 전송에 실패했습니다. (DB에는 저장됨)`);
        }
      } else {
        const guild = interaction.guild;
        if (!guild) {
          void interaction.editReply('서버에서만 사용할 수 있는 명령어입니다.');
          return;
        }

        const members = await guild.members.fetch();
        const userIds = members.map(member => member.user.id);
        
        const insertData: NotificationInsert[] = userIds.map(userId => ({
          user_id: userId,
          ...notificationParams
        }));
        const { data: insertedNotifications, error } = await ctx.supabase
          .from('notifications')
          .insert(insertData)
          .select();

        if (error) throw error;

        // 채널이 지정되면 채널에 공지, 아니면 각 사용자에게 DM
        let sentCount = 0;
        if (channel && 'send' in channel && channel.isTextBased()) {
          try {
            await channel.send({
              content: '@everyone',
              embeds: [embed]
            });
            sentCount = userIds.length; // 채널에 보냈으므로 모두에게 전송된 것으로 간주
          } catch (e) {
            console.error('Failed to send to channel:', e);
          }
        } else {
          // 각 사용자에게 DM 전송
          for (let i = 0; i < userIds.length; i++) {
            const userId = userIds[i];
            const notification = insertedNotifications?.[i];
            try {
              const member = await guild.members.fetch(userId);
              const userComponents = hasReward && notification
                ? new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                      .setCustomId(`claim_reward_${notification.id}`)
                      .setLabel('보상 받기')
                      .setStyle(ButtonStyle.Success)
                      .setEmoji('🎁')
                  )
                : undefined;

              await member.send({
                embeds: [embed],
                components: userComponents ? [userComponents] : undefined
              });
              sentCount++;
            } catch (e) {
              // DM을 받을 수 없는 경우 스킵
              console.error(`Failed to send DM to ${userId}:`, e);
            }
          }
        }

        await interaction.editReply(
          sentCount > 0
            ? `✅ 서버의 모든 멤버(${userIds.length}명)에게 알림을 전송했습니다! (성공: ${sentCount}명)`
            : `⚠️ 알림이 DB에 저장되었지만 디스코드 전송에 실패했습니다. (총 ${userIds.length}명)`
        );
      }
    } catch (error) {
      console.error('알림 전송 실패:', error);
      await interaction.editReply('❌ 알림 전송에 실패했습니다. 다시 시도해주세요.');
    }
  }
};
