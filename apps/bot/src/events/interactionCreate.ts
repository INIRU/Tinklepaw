import type { Client, GuildMember, Interaction } from 'discord.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonStyle, MessageActionRowComponentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

import { commands } from '../commands/index.js';
import { handleError } from '../errorHandler.js';
import { getBotContext } from '../context.js';
import { getAppConfig } from '../services/config.js';
import { clearMusicState, formatDuration, getMusic, getNodeStatus, updateMusicSetupMessage } from '../services/music.js';

import type { SlashCommand } from '../commands/types.js';

const commandMap: Map<string, SlashCommand> = new Map(commands.map((c) => [c.name, c] as const));
const musicUiColor = 0x3b82f6;
const buildMusicStatusEmbed = (title: string, description: string) =>
  new EmbedBuilder().setTitle(title).setDescription(description).setColor(musicUiColor);

const formatQueueLine = (track: { title: string; uri?: string | null; length?: number }, index: number) => {
  const duration = track.length ? formatDuration(track.length) : 'LIVE';
  const link = track.uri ? `[${track.title}](${track.uri})` : track.title;
  return `\`${index + 1}.\` ${link} \`${duration}\``;
};

const getVoiceChannelId = (interaction: Interaction): string | null => {
  const member = interaction.member as GuildMember | null;
  const channel = member?.voice?.channel;
  return channel?.id ?? null;
};

export function registerInteractionCreate(client: Client) {
  client.on('interactionCreate', async (interaction: Interaction) => {
    if (interaction.isChatInputCommand()) {
      const cmd = commandMap.get(interaction.commandName);
      if (!cmd) return;

      try {
        await cmd.execute(interaction);
      } catch (e) {
        await handleError(e, interaction, interaction.commandName);
      }
    } else if (interaction.isStringSelectMenu()) {
      // 알림 선택 메뉴 처리
      if (interaction.customId === 'select_notification') {
        const ctx = getBotContext();
        const notificationId = interaction.values[0];
        const userId = interaction.user.id;

        await interaction.deferUpdate();

        try {
          const { data: notification, error } = await ctx.supabase
            .from('notifications')
            .select('*')
            .eq('id', notificationId)
            .eq('user_id', userId)
            .single();

          if (error || !notification) {
            await interaction.editReply({
              content: '❌ 알림을 찾을 수 없습니다.',
              embeds: [],
              components: []
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

          // 보상이 있는지 명확히 확인
          const hasRewardPoints = notification.reward_points && notification.reward_points > 0;
          const hasRewardItem = notification.reward_item_id && notification.reward_item_qty && notification.reward_item_qty > 0;
          const embed = new EmbedBuilder()
            .setTitle(`${typeEmojis[notification.type] || '📢'} ${notification.title}`)
            .setDescription(notification.content)
            .setColor(typeColors[notification.type] || 0x3498db)
            .setTimestamp(new Date(notification.created_at));

          if (hasRewardPoints || hasRewardItem) {
            const rewardText = [];
            if (hasRewardPoints) {
              rewardText.push(`💰 포인트: ${notification.reward_points!.toLocaleString()}P`);
            }
            if (hasRewardItem) {
              // 아이템 이름 가져오기
              const { data: itemData } = await ctx.supabase
                .from('items')
                .select('name')
                .eq('item_id', notification.reward_item_id!)
                .single();
              
              const itemName = itemData?.name || '아이템';
              rewardText.push(`🎁 ${itemName} x${notification.reward_item_qty}`);
            }
            embed.addFields({ 
              name: '🎁 보상', 
              value: rewardText.join('\n'), 
              inline: false 
            });
          }

          if (notification.is_read) {
            embed.setFooter({ text: '읽음' });
          }

          // 전체 알림 목록 다시 가져오기 (드롭다운 업데이트용)
          const { data: allNotifications } = await ctx.supabase
            .from('notifications')
            .select('id, title, content, type')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(25);

          const currentIndex = allNotifications?.findIndex(n => n.id === notificationId) ?? 0;
          embed.setFooter({ text: `${currentIndex + 1} / ${allNotifications?.length || 1}${notification.is_read ? ' • 읽음' : ''}` });

          // 드롭다운 메뉴 재생성
          const selectMenuOptions = (allNotifications || []).map((notif, idx) => ({
            label: notif.title.length > 100 ? notif.title.substring(0, 97) + '...' : notif.title,
            description: notif.content.length > 50 ? notif.content.substring(0, 47) + '...' : notif.content,
            value: notif.id,
            emoji: typeEmojis[notif.type] || '📢',
            default: idx === currentIndex
          }));

          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_notification')
            .setPlaceholder('알림을 선택하세요...')
            .addOptions(selectMenuOptions);

          const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)
          ];

          // 보상이 있고 아직 받지 않았다면 버튼 추가
          if ((hasRewardPoints || hasRewardItem) && !notification.is_reward_claimed) {
            components.push(
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId(`claim_reward_${notification.id}`)
                  .setLabel('보상 받기')
                  .setStyle(ButtonStyle.Success)
                  .setEmoji('🎁')
              )
            );
          }

          // 읽음 처리
          if (!notification.is_read) {
            await ctx.supabase
              .from('notifications')
              .update({ is_read: true })
              .eq('id', notificationId);
          }

          await interaction.editReply({
            embeds: [embed],
            components
          });
        } catch (e) {
          console.error('알림 선택 처리 실패:', e);
          await interaction.editReply({
            content: '❌ 알림을 불러오지 못했습니다.',
            embeds: [],
            components: []
          });
        }
      }
    } else if (interaction.isModalSubmit()) {
      if (interaction.customId !== 'music_search_modal') return;

      if (!interaction.guildId) {
        await interaction.reply({ embeds: [buildMusicStatusEmbed('🚫 서버 전용', '서버에서만 사용할 수 있어요.')], ephemeral: true });
        return;
      }

      const config = await getAppConfig().catch(() => null);
      if (config?.music_command_channel_id && interaction.channelId !== config.music_command_channel_id) {
        await interaction.reply({
          embeds: [
            buildMusicStatusEmbed(
              '📍 음악 채널 안내',
              `음악 검색은 <#${config.music_command_channel_id}> 채널에서만 사용할 수 있어요.`
            )
          ],
          ephemeral: true
        });
        return;
      }

      const query = interaction.fields.getTextInputValue('music_query').trim();
      if (!query) {
        await interaction.reply({ embeds: [buildMusicStatusEmbed('🔎 검색어 필요', '검색어 또는 URL을 입력해 주세요.')], ephemeral: true });
        return;
      }

      const voiceId = getVoiceChannelId(interaction);
      if (!voiceId) {
        await interaction.reply({ embeds: [buildMusicStatusEmbed('🎧 음성 채널 필요', '먼저 음성 채널에 들어가주세요.')], ephemeral: true });
        return;
      }

      const music = getMusic();
      const nodeStatus = getNodeStatus(music);
      if (!nodeStatus.ready) {
        await interaction.reply({
          embeds: [
            buildMusicStatusEmbed(
              '🚫 Lavalink 연결 없음',
              `${nodeStatus.summary}\n\n서버 상태와 비밀번호(LAVALINK_SERVER_PASSWORD)를 확인해 주세요.`
            )
          ],
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const textId = (config?.music_command_channel_id ?? interaction.channelId) ?? undefined;
      const player = await music.createPlayer({
        guildId: interaction.guildId,
        textId,
        voiceId,
        volume: 60
      });

      const searchResult = await music.search(query, { requester: interaction.user });
      if (!searchResult.tracks.length) {
        await interaction.editReply({ embeds: [buildMusicStatusEmbed('🔎 검색 실패', '검색 결과가 없습니다. 다른 검색어를 시도해 보세요.')] });
        return;
      }

      if (searchResult.type === 'PLAYLIST') {
        player.queue.add(searchResult.tracks);
        updateMusicSetupMessage(player, player.queue.current ?? searchResult.tracks[0]).catch(() => {});
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('📚 플레이리스트 추가됨')
              .setDescription(`**${searchResult.playlistName ?? '플레이리스트'}** (${searchResult.tracks.length}곡)`)
              .setColor(musicUiColor)
          ]
        });
      } else {
        const track = searchResult.tracks[0];
        player.queue.add(track);
        updateMusicSetupMessage(player, player.queue.current ?? track).catch(() => {});
        const position = Math.max(player.queue.slice(0).length, 1);
        const duration = track.length ? formatDuration(track.length) : 'LIVE';
        const title = track.uri ? `[${track.title}](${track.uri})` : track.title;
        const description = `${title} • ${duration}`;
        const titleText = `<a:JIN_1_1:1459073997567295520> 대기열 ${position}번에 추가되었어요.`;
        const botUser = interaction.client.user;
        const embed = new EmbedBuilder()
          .setTitle(titleText)
          .setDescription(description)
          .setColor(musicUiColor)
          .setTimestamp();

        if (botUser) {
          embed.setFooter({ text: botUser.username, iconURL: botUser.displayAvatarURL() });
        }

        if (track.thumbnail) {
          embed.setThumbnail(track.thumbnail);
        }

        await interaction.editReply({ embeds: [embed] });
      }

      if (!player.playing && !player.paused) {
        player.play();
      }
    } else if (interaction.isButton()) {
      // 보상 받기 버튼 처리
      if (interaction.customId.startsWith('claim_reward_')) {
        const notificationId = interaction.customId.replace('claim_reward_', '');
        const ctx = getBotContext();
        const userId = interaction.user.id;

        await interaction.deferReply({ ephemeral: true });

        try {
          const { data, error } = await ctx.supabase.rpc('claim_notification_reward', {
            p_notification_id: notificationId,
            p_user_id: userId
          });

          if (error) {
            throw error;
          }

          const result = data as { success?: boolean; message?: string; points?: number; item_name?: string } | null;

          if (result?.success) {
            // 알림 정보 가져오기
            const { data: notificationData } = await ctx.supabase
              .from('notifications')
              .select('reward_points')
              .eq('id', notificationId)
              .single();

            const claimedPoints = notificationData?.reward_points || 0;
            const rewardText = claimedPoints > 0 
              ? `💰 포인트 ${claimedPoints.toLocaleString()}P`
              : '보상을 성공적으로 받았습니다.';

            const successEmbed = new EmbedBuilder()
              .setTitle('✅ 보상 수령 완료!')
              .setDescription(rewardText)
              .setColor(0x2ecc71)
              .setTimestamp();

            await interaction.editReply({ embeds: [successEmbed] });

            if (interaction.message && 'edit' in interaction.message && interaction.message.embeds.length > 0) {
              try {
                const originalEmbed = interaction.message.embeds[0];
                if (originalEmbed) {
                  const { data: updatedNotification } = await ctx.supabase
                    .from('notifications')
                    .select('*')
                    .eq('id', notificationId)
                    .single();

                  if (updatedNotification) {
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

                    const updatedEmbed = EmbedBuilder.from(originalEmbed)
                      .setTitle(`${typeEmojis[updatedNotification.type] || '📢'} ${updatedNotification.title}`)
                      .setDescription(updatedNotification.content)
                      .setColor(typeColors[updatedNotification.type] || 0x3498db)
                      .setFooter({ text: originalEmbed.footer?.text || '', iconURL: interaction.user.displayAvatarURL() });

                    const hasReward = (updatedNotification.reward_points && updatedNotification.reward_points > 0) || 
                                      (updatedNotification.reward_item_id && updatedNotification.reward_item_qty && updatedNotification.reward_item_qty > 0);

                    if (hasReward) {
                      const rewardText = [];
                      if (updatedNotification.reward_points && updatedNotification.reward_points > 0) {
                        rewardText.push(`💰 포인트: ${updatedNotification.reward_points.toLocaleString()}P`);
                      }
                      if (updatedNotification.reward_item_id && updatedNotification.reward_item_qty) {
                        const { data: itemData } = await ctx.supabase
                          .from('items')
                          .select('name')
                          .eq('item_id', updatedNotification.reward_item_id)
                          .single();
                        
                        const itemName = itemData?.name || '아이템';
                        rewardText.push(`🎁 ${itemName} x${updatedNotification.reward_item_qty}`);
                      }
                      updatedEmbed.spliceFields(0, updatedEmbed.data.fields?.length || 0);
                      updatedEmbed.addFields({ 
                        name: '🎁 보상 (수령 완료)', 
                        value: rewardText.join('\n'), 
                        inline: false 
                      });
                    }

                    const { data: allNotifications } = await ctx.supabase
                      .from('notifications')
                      .select('id, title, content, type, is_read')
                      .eq('user_id', userId)
                      .order('created_at', { ascending: false })
                      .limit(25);

                    const currentIndex = allNotifications?.findIndex(n => n.id === notificationId) ?? 0;
                    updatedEmbed.setFooter({ text: `${currentIndex + 1} / ${allNotifications?.length || 1} • 읽음`, iconURL: interaction.user.displayAvatarURL() });

                    const selectMenuOptions = (allNotifications || []).map((notif, idx) => ({
                      label: notif.title.length > 100 ? notif.title.substring(0, 97) + '...' : notif.title,
                      description: notif.content.length > 50 ? notif.content.substring(0, 47) + '...' : notif.content,
                      value: notif.id,
                      emoji: typeEmojis[notif.type] || '📢',
                      default: idx === currentIndex
                    }));

                    const components = selectMenuOptions.length > 0 ? [
                      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                        new StringSelectMenuBuilder()
                          .setCustomId('select_notification')
                          .setPlaceholder('알림을 선택하세요...')
                          .addOptions(selectMenuOptions)
                      )
                    ] : [];

                    await interaction.message.edit({
                      embeds: [updatedEmbed],
                      components
                    });
                  }
                }
              } catch (e) {
                console.error('Failed to update original message:', e);
              }
            }
          } else {
            throw new Error(result?.message || '보상 수령에 실패했습니다.');
          }
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : '보상 수령에 실패했습니다.';
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ 보상 수령 실패')
            .setDescription(errorMessage)
            .setColor(0xe74c3c)
            .setTimestamp();

          await interaction.editReply({ embeds: [errorEmbed] });
        }
        return;
      }

      if (interaction.customId === 'music_search_open') {
        const modal = new ModalBuilder()
          .setCustomId('music_search_modal')
          .setTitle('음악 검색');

        const queryInput = new TextInputBuilder()
          .setCustomId('music_query')
          .setLabel('검색어 또는 URL')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(queryInput));
        await interaction.showModal(modal);
        return;
      }

      if (interaction.customId === 'music_commands_show') {
        const embed = new EmbedBuilder()
          .setTitle('🎵 | 음악')
          .addFields(
            { name: '/기록', value: '음악 제어 기록을 확인합니다', inline: true },
            { name: '/반복', value: '재생목록을 반복 재생합니다', inline: true },
            { name: '/볼륨', value: '음악의 볼륨을 조정해요', inline: true },
            { name: '/활동표시', value: '활동 표시를 설정합니다', inline: true },
            { name: '/자동재생', value: '자동 재생을 활성화/비활성화합니다', inline: true },
            { name: '/서버변경', value: '음악 서버를 변경합니다', inline: true },
            { name: '/나이트코어', value: '음악에 나이트코어를 적용해요', inline: true },
            { name: '/플랫폼변경', value: '기본 플랫폼을 변경해요', inline: true },
            { name: '/amp 추가', value: 'amp를 추가해요', inline: true },
            { name: '/amp 초기화', value: '등록된 amp 토큰을 모두 삭제해요', inline: true },
            { name: '/amp 리스트', value: '등록된 amp 토큰을 확인해요', inline: true }
          )
          .setColor(musicUiColor);

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (interaction.customId === 'music_queue_show') {
        if (!interaction.guildId) {
          await interaction.reply({ embeds: [buildMusicStatusEmbed('🚫 서버 전용', '서버에서만 사용할 수 있어요.')], ephemeral: true });
          return;
        }

        const music = getMusic();
        const player = music.players.get(interaction.guildId);
        if (!player) {
          await interaction.reply({ embeds: [buildMusicStatusEmbed('🎵 재생 없음', '현재 재생 중인 음악이 없습니다.')], ephemeral: true });
          return;
        }

        const current = player.queue.current;
        const currentLine = current
          ? `지금 재생 중: ${current.uri ? `[${current.title}](${current.uri})` : current.title} \`${current.length ? formatDuration(current.length) : 'LIVE'}\``
          : null;
        const upcoming = player.queue.slice(0, 10);
        const lines = upcoming.map((track, idx) => formatQueueLine(track, idx)).join('\n');
        const description = `${currentLine ? `${currentLine}\n\n` : ''}${lines || '대기열이 비어있습니다.'}`;

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('📜 대기열')
              .setDescription(description)
              .setColor(musicUiColor)
          ],
          ephemeral: true
        });
        return;
      }

      if (['music_prev', 'music_play', 'music_pause', 'music_stop', 'music_next'].includes(interaction.customId)) {
        if (!interaction.guildId) {
          await interaction.reply({ embeds: [buildMusicStatusEmbed('🚫 서버 전용', '서버에서만 사용할 수 있어요.')], ephemeral: true });
          return;
        }

        const music = getMusic();
        const player = music.players.get(interaction.guildId);
        if (!player) {
          await interaction.reply({ embeds: [buildMusicStatusEmbed('🎵 재생 없음', '현재 재생 중인 음악이 없습니다.')], ephemeral: true });
          return;
        }

        const voiceId = getVoiceChannelId(interaction);
        if (!voiceId) {
          await interaction.reply({ embeds: [buildMusicStatusEmbed('🎧 음성 채널 필요', '먼저 음성 채널에 들어가주세요.')], ephemeral: true });
          return;
        }

        if (player.voiceId && player.voiceId !== voiceId) {
          await interaction.reply({ embeds: [buildMusicStatusEmbed('🚫 다른 음성 채널', '현재 재생 중인 채널에서만 조작할 수 있어요.')], ephemeral: true });
          return;
        }

        if (interaction.customId === 'music_prev') {
          const previous = player.getPrevious(true);
          if (!previous) {
            await interaction.reply({ embeds: [buildMusicStatusEmbed('⏮️ 이전 곡 없음', '이전 곡이 없습니다.')], ephemeral: true });
            return;
          }
          await player.play(previous);
          updateMusicSetupMessage(player, previous).catch(() => {});
          await interaction.reply({ embeds: [buildMusicStatusEmbed('⏮️ 이전 곡', '이전 곡으로 이동했어요.')], ephemeral: true });
          return;
        }

        if (interaction.customId === 'music_play') {
          if (player.playing && !player.paused) {
            await interaction.reply({ embeds: [buildMusicStatusEmbed('▶️ 재생 중', '이미 재생 중입니다.')], ephemeral: true });
            return;
          }
          if (player.paused) {
            player.pause(false);
          } else {
            await player.play();
          }
          await interaction.reply({ embeds: [buildMusicStatusEmbed('▶️ 재생', '재생을 시작했어요.')], ephemeral: true });
          return;
        }

        if (interaction.customId === 'music_pause') {
          if (!player.playing || player.paused) {
            await interaction.reply({ embeds: [buildMusicStatusEmbed('⏸️ 일시정지', '이미 일시정지 상태입니다.')], ephemeral: true });
            return;
          }
          player.pause(true);
          await interaction.reply({ embeds: [buildMusicStatusEmbed('⏸️ 일시정지', '재생을 일시정지했어요.')], ephemeral: true });
          return;
        }

        if (interaction.customId === 'music_stop') {
          player.destroy();
          updateMusicSetupMessage(player, null).catch(() => {});
          clearMusicState(player.guildId).catch(() => {});
          await interaction.reply({ embeds: [buildMusicStatusEmbed('⏹️ 정지', '재생을 중지했어요.')], ephemeral: true });
          return;
        }

        if (interaction.customId === 'music_next') {
          player.skip();
          await interaction.reply({ embeds: [buildMusicStatusEmbed('⏭️ 다음 곡', '다음 곡으로 이동했어요.')], ephemeral: true });
          return;
        }
      }
    }
  });
}
