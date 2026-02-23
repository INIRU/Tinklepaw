import type { Client, GuildMember, Interaction } from 'discord.js';
import type { KazagumoPlayer } from 'kazagumo';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonStyle, MessageActionRowComponentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits } from 'discord.js';

import { commands } from '../commands/index.js';
import { handleError } from '../errorHandler.js';
import { getBotContext } from '../context.js';
import { getAppConfig } from '../services/config.js';
import { forgetVoiceAutoRoom, getVoiceAutoRoom, getVoiceRoomTemplate, rememberVoiceAutoRoom, saveVoiceRoomTemplateFromChannel, setVoiceRoomLock } from '../services/voice-interface.js';
import { isSpotifyQuery, normalizeMusicQuery, searchTracksWithFallback } from '../services/musicSearch.js';
import { applyMusicFilterPreset, clearMusicState, formatDuration, getMusic, getNodeStatus, MUSIC_FILTER_LABELS, updateMusicSetupMessage, updateMusicState } from '../services/music.js';
import type { MusicFilterPreset } from '../services/music.js';

import type { SlashCommand } from '../commands/types.js';

const commandMap: Map<string, SlashCommand> = new Map(commands.map((c) => [c.name, c] as const));
const musicCommandActionMap: Partial<Record<string, string>> = {
  setup: 'setup',
};
const FILTER_PRESET_OPTIONS: Array<{ value: MusicFilterPreset; label: string; description: string }> = [
  { value: 'off', label: '필터 해제', description: '원본 사운드로 재생합니다.' },
  { value: 'bass_boost', label: 'Bass Boost', description: '저음을 강조합니다.' },
  { value: 'nightcore', label: 'Nightcore', description: '속도와 피치를 높입니다.' },
  { value: 'vaporwave', label: 'Vaporwave', description: '속도/피치를 낮춰 몽환적으로 만듭니다.' },
  { value: 'karaoke', label: 'Karaoke', description: '보컬 대역을 약화합니다.' }
];
const pendingFilterSelection = new Map<string, MusicFilterPreset>();
type AskMode = 'anonymous' | 'public';
const pendingAskModeSelection = new Map<string, { mode: AskMode; selectedAt: number }>();
const ASK_MODE_TTL_MS = 20 * 60 * 1000;
const ASK_PROFANITY_TERMS: Array<{ label: string; regex: RegExp }> = [
  { label: '씨발', regex: /씨발|시발|ㅅㅂ/gi },
  { label: '병신', regex: /병신|븅신|ㅂㅅ/gi },
  { label: '좆', regex: /좆|좃|ㅈ같/gi },
  { label: '개새끼', regex: /개새끼|개색기|개쉐이/gi },
  { label: 'fuck', regex: /fuck|f\*\*k/gi },
  { label: 'shit', regex: /shit|s\*\*t/gi },
];
const musicUiColor = 0x3b82f6;
const buildMusicStatusEmbed = (title: string, description: string) =>
  new EmbedBuilder().setTitle(title).setDescription(description).setColor(musicUiColor);

const toFilterPreset = (value: unknown): MusicFilterPreset => {
  if (value === 'bass_boost' || value === 'nightcore' || value === 'vaporwave' || value === 'karaoke') {
    return value;
  }
  return 'off';
};

const filterSelectionKey = (guildId: string, userId: string) => `${guildId}:${userId}`;
const askModeSelectionKey = (panelMessageId: string, userId: string) => `${panelMessageId}:${userId}`;

const rememberAskModeSelection = (panelMessageId: string, userId: string, mode: AskMode) => {
  const now = Date.now();
  for (const [key, value] of pendingAskModeSelection.entries()) {
    if (now - value.selectedAt > ASK_MODE_TTL_MS) {
      pendingAskModeSelection.delete(key);
    }
  }
  pendingAskModeSelection.set(askModeSelectionKey(panelMessageId, userId), { mode, selectedAt: now });
};

const getAskModeSelection = (panelMessageId: string, userId: string): AskMode | null => {
  const key = askModeSelectionKey(panelMessageId, userId);
  const entry = pendingAskModeSelection.get(key);
  if (!entry) return null;
  if (Date.now() - entry.selectedAt > ASK_MODE_TTL_MS) {
    pendingAskModeSelection.delete(key);
    return null;
  }
  return entry.mode;
};

const askModeLabel = (mode: AskMode) => (mode === 'anonymous' ? '익명 질문' : '질문');

const detectAskProfanity = (content: string) => {
  const matches = ASK_PROFANITY_TERMS.filter((entry) => entry.regex.test(content)).map((entry) => entry.label);
  for (const entry of ASK_PROFANITY_TERMS) {
    entry.regex.lastIndex = 0;
  }
  return {
    flagged: matches.length > 0,
    matches,
  };
};

const clipAskText = (value: string, max = 900) => {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
};

const buildFilterRows = (selected: MusicFilterPreset) => [
  new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('music_filter_select')
      .setPlaceholder('오디오 필터를 선택하세요')
      .addOptions(
        FILTER_PRESET_OPTIONS.map((option) => ({
          label: option.label,
          description: option.description,
          value: option.value,
          default: option.value === selected
        }))
      )
  ),
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('music_filter_apply').setLabel('필터 적용').setStyle(ButtonStyle.Primary).setEmoji('✅')
  )
];

const formatQueueLine = (track: { title: string; uri?: string | null; length?: number }, index: number) => {
  const duration = track.length ? formatDuration(track.length) : 'LIVE';
  const link = track.uri ? `[${track.title}](${track.uri})` : track.title;
  return `\`${index + 1}.\` ${link} \`${duration}\``;
};

const scheduleMusicStateUpdate = (player: KazagumoPlayer, delayMs = 700) => {
  setTimeout(() => {
    updateMusicState(player).catch(() => {});
  }, delayMs);
};

const getVoiceChannelId = (interaction: Interaction): string | null => {
  const member = interaction.member as GuildMember | null;
  const channel = member?.voice?.channel;
  return channel?.id ?? null;
};

const getMemberVoiceChannel = (interaction: Interaction) => {
  const member = interaction.member as GuildMember | null;
  const channel = member?.voice?.channel;
  if (!channel || channel.type !== ChannelType.GuildVoice) return null;
  return channel;
};

const hasVoiceInterfacePermission = (interaction: Interaction) => {
  const member = interaction.member as GuildMember | null;
  return Boolean(member?.permissions?.has(PermissionFlagsBits.ManageChannels));
};

const isMaintenanceBypassMember = (interaction: Interaction) => {
  const member = interaction.member as GuildMember | null;
  if (!member) return false;
  if (interaction.guild?.ownerId && interaction.guild.ownerId === interaction.user.id) return true;
  return Boolean(
    member.permissions?.has(PermissionFlagsBits.Administrator) ||
      member.permissions?.has(PermissionFlagsBits.ManageGuild)
  );
};

const buildMaintenanceDescription = (reason: string | null | undefined, untilIso: string | null | undefined) => {
  const lines = ['현재 서비스 점검 중이라 명령어/버튼 사용이 잠시 제한됩니다.'];

  if (reason && reason.trim().length > 0) {
    lines.push(`\n**사유**\n${reason.trim()}`);
  }

  const untilMs = untilIso ? Date.parse(untilIso) : Number.NaN;
  if (Number.isFinite(untilMs)) {
    const unix = Math.floor(untilMs / 1000);
    lines.push(`\n**예상 종료**\n<t:${unix}:F> (<t:${unix}:R>)`);
  }

  return lines.join('\n');
};

const normalizeMaintenanceCommandTargets = (input: unknown) => {
  if (!Array.isArray(input)) return [] as string[];
  const normalized = input
    .map((item) => String(item ?? '').trim().toLowerCase())
    .map((item) => item.replace(/^\/+/, ''))
    .map((item) => item.replace(/[^a-z0-9_-]/g, ''))
    .filter(Boolean)
    .slice(0, 128);
  return Array.from(new Set(normalized));
};

const getMaintenanceCommandToken = (interaction: Interaction): string | null => {
  if (interaction.isChatInputCommand()) {
    return interaction.commandName.toLowerCase();
  }

  const withCustomId = interaction as Interaction & { customId?: unknown };
  if (typeof withCustomId.customId === 'string' && withCustomId.customId.length > 0) {
    const raw = withCustomId.customId.toLowerCase();
    const primary = raw.split(':')[0]?.split('_')[0]?.trim();
    return primary || null;
  }

  return null;
};

const canManageVoiceInterfaceChannel = async (interaction: Interaction, channelId: string) => {
  if (hasVoiceInterfacePermission(interaction)) return true;

  const tracked = await getVoiceAutoRoom(channelId).catch(() => null);
  return tracked?.ownerUserId === interaction.user.id;
};

type MusicControlLogStatus = 'requested' | 'success' | 'failed';

const logMusicControlInteraction = async (params: {
  guildId: string | null;
  action: string;
  status: MusicControlLogStatus;
  message: string;
  requestedBy: string | null;
  payload?: Record<string, string | number | boolean | null> | null;
}) => {
  if (!params.guildId) return;

  const ctx = getBotContext();
  const { error } = await ctx.supabase.from('music_control_logs').insert({
    guild_id: params.guildId,
    action: params.action,
    status: params.status,
    message: params.message,
    payload: params.payload ?? null,
    requested_by: params.requestedBy,
  });

  if (error) {
    console.warn('[MusicLog] Failed to write interaction control log:', error);
  }
};

export function registerInteractionCreate(client: Client) {
  client.on('interactionCreate', async (interaction: Interaction) => {
    try {
      const cfg = await getAppConfig();
      if (cfg.maintenance_mode_enabled && !isMaintenanceBypassMember(interaction)) {
        const targets = normalizeMaintenanceCommandTargets(cfg.maintenance_bot_target_commands);
        const commandToken = getMaintenanceCommandToken(interaction);
        const inScope = targets.length === 0 || (commandToken ? targets.includes(commandToken) : false);

        if (inScope) {
          if (interaction.isRepliable()) {
            const embed = new EmbedBuilder()
              .setTitle('🛠️ 점검 중입니다')
              .setDescription(buildMaintenanceDescription(cfg.maintenance_mode_reason, cfg.maintenance_mode_until))
              .setColor(0xf59e0b);
            await interaction.reply({ embeds: [embed], ephemeral: true });
          }
          return;
        }
      }
    } catch (e) {
      console.error('[interactionCreate] failed to evaluate maintenance mode:', e);
    }

    if (interaction.isChatInputCommand()) {
      const cmd = commandMap.get(interaction.commandName);
      if (!cmd) return;
      const mappedMusicAction = musicCommandActionMap[interaction.commandName];

      try {
        if (mappedMusicAction) {
          await logMusicControlInteraction({
            guildId: interaction.guildId,
            action: mappedMusicAction,
            status: 'requested',
            message: `Discord command ${interaction.commandName} requested.`,
            requestedBy: interaction.user.id,
            payload: {
              source: 'discord_command',
              command: interaction.commandName,
            },
          });
        }

        await cmd.execute(interaction);

        if (mappedMusicAction) {
          await logMusicControlInteraction({
            guildId: interaction.guildId,
            action: mappedMusicAction,
            status: 'success',
            message: `Discord command ${interaction.commandName} completed.`,
            requestedBy: interaction.user.id,
            payload: {
              source: 'discord_command',
              command: interaction.commandName,
            },
          });
        }
      } catch (e) {
        if (mappedMusicAction) {
          await logMusicControlInteraction({
            guildId: interaction.guildId,
            action: mappedMusicAction,
            status: 'failed',
            message: e instanceof Error ? e.message : `Discord command ${interaction.commandName} failed.`,
            requestedBy: interaction.user.id,
            payload: {
              source: 'discord_command',
              command: interaction.commandName,
            },
          });
        }
        await handleError(e, interaction, interaction.commandName);
      }
    } else if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'ask:mode') {
        const panelMessageId = interaction.message?.id;
        if (!panelMessageId) {
          await interaction.reply({ content: '질문 모드를 저장할 수 없어요. 패널을 다시 만들어 주세요.', ephemeral: true });
          return;
        }

        const mode: AskMode = interaction.values[0] === 'anonymous' ? 'anonymous' : 'public';
        rememberAskModeSelection(panelMessageId, interaction.user.id, mode);

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('✅ 질문 모드 설정 완료')
              .setDescription(`현재 모드: **${askModeLabel(mode)}**\n이제 아래 **질문하기** 버튼을 눌러 작성해 주세요.`)
              .setColor(0xec4899)
          ],
          ephemeral: true,
        });
        return;
      }

      if (interaction.customId === 'music_filter_select') {
        if (!interaction.guildId) {
          await interaction.update({
            embeds: [buildMusicStatusEmbed('🚫 서버 전용', '서버에서만 사용할 수 있어요.')],
            components: []
          });
          return;
        }

        const selected = toFilterPreset(interaction.values[0]);
        pendingFilterSelection.set(filterSelectionKey(interaction.guildId, interaction.user.id), selected);

        await interaction.update({
          embeds: [
            buildMusicStatusEmbed('🎛️ 필터 선택', `선택된 필터: **${MUSIC_FILTER_LABELS[selected]}**\n\n아래 버튼으로 적용하세요.`)
          ],
          components: buildFilterRows(selected)
        });
        return;
      }

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
      if (interaction.customId.startsWith('ask:submit:')) {
        if (!interaction.guildId || !interaction.guild) {
          await interaction.reply({ content: '서버에서만 사용할 수 있어요.', ephemeral: true });
          return;
        }

        const parts = interaction.customId.split(':');
        if (parts.length < 5) {
          await interaction.reply({ content: '질문 요청 형식이 올바르지 않아요. 패널을 다시 만들어 주세요.', ephemeral: true });
          return;
        }

        const mode: AskMode = parts[2] === 'anonymous' ? 'anonymous' : 'public';
        const logChannelIdRaw = parts[3] ?? 'none';
        const panelMessageId = parts[4] ?? '';

        const rawQuestion = interaction.fields.getTextInputValue('ask:question') ?? '';
        const question = clipAskText(rawQuestion, 900);
        if (question.length < 4) {
          await interaction.reply({ content: '질문은 4자 이상 입력해 주세요.', ephemeral: true });
          return;
        }

        const sourceChannel = interaction.channel;
        if (!sourceChannel || !sourceChannel.isTextBased() || sourceChannel.isDMBased() || !('messages' in sourceChannel)) {
          await interaction.reply({ content: '질문을 생성할 수 없는 채널이에요.', ephemeral: true });
          return;
        }

        const panelMessage = await sourceChannel.messages.fetch(panelMessageId).catch(() => null);
        if (!panelMessage) {
          await interaction.reply({ content: '에스크 패널 메시지를 찾지 못했어요. 다시 셋팅해 주세요.', ephemeral: true });
          return;
        }

        const now = new Date();
        const timestampLabel = `${now.getMonth() + 1}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

        const profanity = detectAskProfanity(question);
        const questionEmbed = new EmbedBuilder()
          .setColor(mode === 'anonymous' ? 0xdb2777 : 0x3b82f6)
          .setTitle(mode === 'anonymous' ? '🎭 익명 질문' : '💬 질문')
          .setDescription(question)
          .addFields(
            { name: '질문 타입', value: askModeLabel(mode), inline: true },
            { name: '답변 위치', value: '아래 연결된 쓰레드에서 답변해 주세요.', inline: true },
            {
              name: '작성자',
              value: mode === 'anonymous' ? '익명' : `<@${interaction.user.id}>`,
              inline: true,
            }
          )
          .setFooter({ text: `작성 시각: ${now.toLocaleString('ko-KR')}` });

        const askMessage = await sourceChannel.send({
          content: mode === 'public' ? `📮 질문이 접수되었어요 · 질문자: <@${interaction.user.id}>` : '📮 익명 질문이 접수되었어요',
          embeds: [questionEmbed],
        });

        const threadName = `${mode === 'anonymous' ? '익명질문' : '질문'}-${timestampLabel}`.slice(0, 90);
        const thread = await askMessage.startThread({
          name: threadName,
          autoArchiveDuration: 1440,
          reason: `ask question by ${interaction.user.tag}`,
        }).catch(() => null);
        if (!thread) {
          await askMessage.delete().catch(() => null);
          await interaction.reply({ content: '질문 쓰레드를 만들지 못했어요. 봇 권한을 확인해 주세요.', ephemeral: true });
          return;
        }

        await thread.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x14b8a6)
              .setTitle('🛠️ 답변 가이드')
              .setDescription('관리자분들은 이 쓰레드에 답변을 남겨 주세요.')
          ]
        }).catch(() => {});

        const fallbackCfg = await getAppConfig().catch(() => null);
        const logChannelId = logChannelIdRaw !== 'none'
          ? logChannelIdRaw
          : (fallbackCfg?.error_log_channel_id ?? null);

        if (logChannelId) {
          const logChannel = await interaction.guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel && logChannel.isTextBased() && !logChannel.isDMBased()) {
            const logEmbed = new EmbedBuilder()
              .setColor(profanity.flagged ? 0xef4444 : 0x6366f1)
              .setTitle('🧾 에스크 감사 로그')
              .addFields(
                {
                  name: '작성자',
                  value: `<@${interaction.user.id}>\n${interaction.user.tag}\n\`${interaction.user.id}\``,
                  inline: true,
                },
                {
                  name: '질문 타입',
                  value: askModeLabel(mode),
                  inline: true,
                },
                {
                  name: '욕설 감지',
                  value: profanity.flagged
                    ? `감지됨 (${profanity.matches.join(', ')})`
                    : '정상',
                  inline: true,
                },
                {
                  name: '위치',
                  value: `패널: <#${interaction.channelId}>\n질문: [바로가기](https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${askMessage.id})\n쓰레드: <#${thread.id}>`,
                  inline: true,
                },
                {
                  name: '질문 링크',
                  value: `[바로가기](https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${askMessage.id})`,
                  inline: true,
                },
                {
                  name: '질문 내용',
                  value: clipAskText(question, 1000),
                  inline: false,
                }
              )
              .setTimestamp();

            await logChannel.send({
              content: profanity.flagged ? '🚨 욕설 감지된 에스크가 접수되었습니다.' : undefined,
              embeds: [logEmbed],
            }).catch(() => {});
          }
        }

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x22c55e)
              .setTitle('✅ 질문이 접수되었어요')
              .setDescription(`질문이 채널에 등록되고 ${thread} 쓰레드가 생성되었어요. 관리자 답변을 기다려 주세요.`)
          ],
          ephemeral: true,
        });
        return;
      }

      if (interaction.customId === 'voice_if:rename_modal') {
        if (!interaction.guild) {
          await interaction.reply({ content: '서버에서만 사용할 수 있어요.', ephemeral: true });
          return;
        }

        const channel = getMemberVoiceChannel(interaction);
        if (!channel) {
          await interaction.reply({ content: '먼저 대상 음성 채널에 접속해 주세요.', ephemeral: true });
          return;
        }

        const manageableByUser = await canManageVoiceInterfaceChannel(interaction, channel.id);
        if (!manageableByUser) {
          await interaction.reply({ content: '자신이 만든 통화방(또는 관리자 권한)이 있어야 변경할 수 있어요.', ephemeral: true });
          return;
        }

        if (!channel.manageable) {
          await interaction.reply({ content: '이 채널은 봇이 수정할 수 없어요.', ephemeral: true });
          return;
        }

        const rawName = interaction.fields.getTextInputValue('voice_if:new_name').trim();
        if (!rawName) {
          await interaction.reply({ content: '변경할 통화방 이름을 입력해 주세요.', ephemeral: true });
          return;
        }

        const nextName = rawName.slice(0, 90);
        await channel.setName(nextName, 'voice interface rename');
        await saveVoiceRoomTemplateFromChannel(interaction.user.id, channel);
        await interaction.reply({ content: `통화방 이름을 **${nextName}** 으로 변경했어요.`, ephemeral: true });
        return;
      }

      if (interaction.customId === 'voice_if:limit_modal') {
        if (!interaction.guild) {
          await interaction.reply({ content: '서버에서만 사용할 수 있어요.', ephemeral: true });
          return;
        }

        const channel = getMemberVoiceChannel(interaction);
        if (!channel) {
          await interaction.reply({ content: '먼저 대상 음성 채널에 접속해 주세요.', ephemeral: true });
          return;
        }

        const manageableByUser = await canManageVoiceInterfaceChannel(interaction, channel.id);
        if (!manageableByUser) {
          await interaction.reply({ content: '자신이 만든 통화방(또는 관리자 권한)만 인원수를 바꿀 수 있어요.', ephemeral: true });
          return;
        }

        if (!channel.manageable) {
          await interaction.reply({ content: '이 채널은 봇이 수정할 수 없어요.', ephemeral: true });
          return;
        }

        const rawLimit = interaction.fields.getTextInputValue('voice_if:new_limit').trim();
        const nextLimit = Number(rawLimit);
        if (!Number.isInteger(nextLimit) || nextLimit < 0 || nextLimit > 99) {
          await interaction.reply({ content: '인원수는 0~99 사이의 정수만 입력할 수 있어요. (0=제한 해제)', ephemeral: true });
          return;
        }

        await channel.setUserLimit(nextLimit, `voice interface modal limit by ${interaction.user.tag}`);
        await saveVoiceRoomTemplateFromChannel(interaction.user.id, channel);

        await interaction.reply({
          content: nextLimit === 0 ? '인원 제한을 해제했어요.' : `인원 제한을 ${nextLimit}명으로 설정했어요.`,
          ephemeral: true,
        });
        return;
      }

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

      const query = normalizeMusicQuery(interaction.fields.getTextInputValue('music_query'));
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
      await logMusicControlInteraction({
        guildId: interaction.guildId,
        action: 'add',
        status: 'requested',
        message: 'Discord modal music add requested.',
        requestedBy: interaction.user.id,
        payload: {
          source: 'discord_modal',
          query,
        },
      });

      const textId = (config?.music_command_channel_id ?? interaction.channelId) ?? undefined;
      const player = await music.createPlayer({
        guildId: interaction.guildId,
        textId,
        voiceId,
        volume: 60
      });

      if (isSpotifyQuery(query)) {
        await logMusicControlInteraction({
          guildId: interaction.guildId,
          action: 'add',
          status: 'failed',
          message: 'Spotify URL is not supported.',
          requestedBy: interaction.user.id,
          payload: {
            source: 'discord_modal',
            query,
          },
        });
        await interaction.editReply({
          embeds: [buildMusicStatusEmbed('🚫 Spotify 미지원', 'Spotify URL은 아직 지원하지 않아요. YouTube 또는 SoundCloud URL을 사용해 주세요.')]
        });
        return;
      }

      const searchResult = await searchTracksWithFallback(music, query, {
        id: interaction.user.id,
        username: interaction.user.username,
        displayName: (interaction.member as GuildMember | null)?.displayName ?? interaction.user.globalName ?? interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL({ extension: 'png', size: 128 }),
        source: 'discord_modal'
      });
      if (!searchResult.result.tracks.length) {
        await logMusicControlInteraction({
          guildId: interaction.guildId,
          action: 'add',
          status: 'failed',
          message: 'No tracks found for modal add query.',
          requestedBy: interaction.user.id,
          payload: {
            source: 'discord_modal',
            query,
            fallback_used: searchResult.fallbackUsed,
            fallback_query: searchResult.fallbackQuery ?? null,
          },
        });
        await interaction.editReply({
          embeds: [buildMusicStatusEmbed('🔎 검색 실패', '검색 결과가 없습니다. URL 자동 보정 검색도 시도했지만 실패했습니다.')] 
        });
        return;
      }

      const fallbackLine =
        searchResult.fallbackUsed && searchResult.fallbackQuery
          ? `\n\n자동 보정 검색: \`${searchResult.fallbackQuery}\``
          : '';

      if (searchResult.result.type === 'PLAYLIST') {
        player.queue.add(searchResult.result.tracks);
        updateMusicSetupMessage(player, player.queue.current ?? searchResult.result.tracks[0]).catch(() => {});
        await logMusicControlInteraction({
          guildId: interaction.guildId,
          action: 'add',
          status: 'success',
          message: `Playlist added via Discord modal (${searchResult.result.tracks.length} tracks).`,
          requestedBy: interaction.user.id,
          payload: {
            source: 'discord_modal',
            query,
            fallback_used: searchResult.fallbackUsed,
            fallback_query: searchResult.fallbackQuery ?? null,
          },
        });
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('📚 플레이리스트 추가됨')
              .setDescription(
                `**${searchResult.result.playlistName ?? '플레이리스트'}** (${searchResult.result.tracks.length}곡)${fallbackLine}`
              )
              .setColor(musicUiColor)
          ]
        });
      } else {
        const track = searchResult.result.tracks[0];
        player.queue.add(track);
        updateMusicSetupMessage(player, player.queue.current ?? track).catch(() => {});
        await logMusicControlInteraction({
          guildId: interaction.guildId,
          action: 'add',
          status: 'success',
          message: `${track.title} added via Discord modal.`,
          requestedBy: interaction.user.id,
          payload: {
            source: 'discord_modal',
            query,
            track_id: track.track,
            fallback_used: searchResult.fallbackUsed,
            fallback_query: searchResult.fallbackQuery ?? null,
          },
        });
        const position = Math.max(player.queue.slice(0).length, 1);
        const duration = track.length ? formatDuration(track.length) : 'LIVE';
        const title = track.uri ? `[${track.title}](${track.uri})` : track.title;
        const description = `${title} • ${duration}${fallbackLine}`;
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

      scheduleMusicStateUpdate(player);
    } else if (interaction.isButton()) {
      if (interaction.customId.startsWith('ask:open:')) {
        const panelMessageId = interaction.message?.id;
        if (!panelMessageId) {
          await interaction.reply({ content: '에스크 패널 정보를 찾지 못했어요.', ephemeral: true });
          return;
        }

        const mode = getAskModeSelection(panelMessageId, interaction.user.id) ?? 'public';
        const [, , logChannelIdRaw = 'none'] = interaction.customId.split(':');
        const modalCustomId = `ask:submit:${mode}:${logChannelIdRaw}:${panelMessageId}`;

        const modal = new ModalBuilder()
          .setCustomId(modalCustomId)
          .setTitle(mode === 'anonymous' ? '익명 질문 작성' : '질문 작성');

        const questionInput = new TextInputBuilder()
          .setCustomId('ask:question')
          .setLabel('질문 내용')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(4)
          .setMaxLength(900)
          .setPlaceholder(
            mode === 'anonymous'
              ? '익명으로 남길 질문을 입력해 주세요.'
              : '관리자에게 남길 질문을 입력해 주세요.'
          );

        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(questionInput));
        await interaction.showModal(modal);
        return;
      }

      if (interaction.customId.startsWith('voice_if:')) {
        if (!interaction.guild) {
          await interaction.reply({ content: '서버에서만 사용할 수 있어요.', ephemeral: true });
          return;
        }

        const [, action, value] = interaction.customId.split(':');

        if (action === 'create') {
          const member = interaction.member as GuildMember | null;
          const guild = interaction.guild;
          if (!guild) {
            await interaction.reply({ content: '서버에서만 사용할 수 있어요.', ephemeral: true });
            return;
          }
          const baseChannel = getMemberVoiceChannel(interaction);
          const config = await getAppConfig().catch(() => null);
          const limit = value === '1' ? 1 : value === '2' ? 2 : 0;
          const roomLabel = limit === 1 ? '1인실' : limit === 2 ? '2인실' : '다인실';
          const displayName = member?.displayName ?? interaction.user.username;
          const template = await getVoiceRoomTemplate(interaction.user.id, `${displayName}-${roomLabel}`);
          const parentId = config?.voice_interface_category_id ?? baseChannel?.parentId ?? undefined;

          const created = await guild.channels.create({
            name: template.roomName,
            type: ChannelType.GuildVoice,
            userLimit: limit,
            parent: parentId ?? undefined,
            rtcRegion: template.rtcRegion ?? undefined,
            reason: `voice interface create by ${interaction.user.tag}`,
          });

          if (created.type === ChannelType.GuildVoice) {
            if (template.isLocked) {
              await setVoiceRoomLock(created, interaction.user.id, true, `voice interface lock restore by ${interaction.user.tag}`);
            } else {
              await created.permissionOverwrites.edit(interaction.user.id, {
                Connect: true,
                ManageChannels: true,
                MoveMembers: true,
              });
            }

            await rememberVoiceAutoRoom(created.id, interaction.user.id, created.parentId ?? null);

            setTimeout(async () => {
              try {
                const tracked = await getVoiceAutoRoom(created.id).catch(() => null);
                if (!tracked) return;

                const current = await guild.channels.fetch(created.id).catch(() => null);
                if (!current) {
                  await forgetVoiceAutoRoom(created.id).catch(() => null);
                  return;
                }

                if (current.type !== ChannelType.GuildVoice) {
                  await forgetVoiceAutoRoom(created.id).catch(() => null);
                  return;
                }

                const nonBotMembers = current.members.filter((m) => !m.user.bot);
                if (nonBotMembers.size > 0) return;

                await saveVoiceRoomTemplateFromChannel(tracked.ownerUserId, current);
                await forgetVoiceAutoRoom(created.id).catch(() => null);
                await current.delete('voice interface no-join timeout cleanup (120s)').catch(() => null);
              } catch {
                // ignore timer cleanup failures
              }
            }, 120_000);
          }

          if (member?.voice?.channelId) {
            await member.voice.setChannel(created).catch(() => {});
          }

          await interaction.reply({
            content: `생성 완료: <#${created.id}> (${roomLabel})`,
            ephemeral: true,
          });
          return;
        }

        if (action === 'rename_open') {
          const channel = getMemberVoiceChannel(interaction);
          if (!channel) {
            await interaction.reply({ content: '먼저 이름을 바꿀 음성 채널에 접속해 주세요.', ephemeral: true });
            return;
          }

          const manageableByUser = await canManageVoiceInterfaceChannel(interaction, channel.id);
          if (!manageableByUser) {
            await interaction.reply({ content: '자신이 만든 통화방(또는 관리자 권한)만 이름을 바꿀 수 있어요.', ephemeral: true });
            return;
          }

          const modal = new ModalBuilder()
            .setCustomId('voice_if:rename_modal')
            .setTitle('통화방 이름 변경');

          const input = new TextInputBuilder()
            .setCustomId('voice_if:new_name')
            .setLabel('새 통화방 이름')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(channel.name.slice(0, 90));

          modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
          await interaction.showModal(modal);
          return;
        }

        if (action === 'limit_open') {
          const channel = getMemberVoiceChannel(interaction);
          if (!channel) {
            await interaction.reply({ content: '먼저 인원수를 바꿀 음성 채널에 접속해 주세요.', ephemeral: true });
            return;
          }

          const manageableByUser = await canManageVoiceInterfaceChannel(interaction, channel.id);
          if (!manageableByUser) {
            await interaction.reply({ content: '자신이 만든 통화방(또는 관리자 권한)만 인원수를 바꿀 수 있어요.', ephemeral: true });
            return;
          }

          const currentLimit = channel.userLimit > 0 ? channel.userLimit : 0;
          const modal = new ModalBuilder()
            .setCustomId('voice_if:limit_modal')
            .setTitle('통화방 인원수 조정');

          const input = new TextInputBuilder()
            .setCustomId('voice_if:new_limit')
            .setLabel('인원수 (0~99, 0은 제한 해제)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('0')
            .setValue(String(currentLimit));

          modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
          await interaction.showModal(modal);
          return;
        }

        if (action === 'invite') {
          const target = getMemberVoiceChannel(interaction);
          if (!target) {
            await interaction.reply({ content: '먼저 초대 링크를 만들 음성 채널에 접속해 주세요.', ephemeral: true });
            return;
          }

          const manageableByUser = await canManageVoiceInterfaceChannel(interaction, target.id);
          if (!manageableByUser) {
            await interaction.reply({ content: '자신이 만든 통화방(또는 관리자 권한)만 초대 링크를 만들 수 있어요.', ephemeral: true });
            return;
          }

          const invite = await target.createInvite({
            maxAge: 3600,
            maxUses: 0,
            temporary: false,
            unique: true,
            reason: `voice interface invite by ${interaction.user.tag}`,
          });

          await interaction.reply({ content: `초대 링크 생성 완료: ${invite.url}`, ephemeral: true });
          return;
        }

        const target = getMemberVoiceChannel(interaction);
        if (!target) {
          await interaction.reply({ content: '먼저 대상 음성 채널에 접속해 주세요.', ephemeral: true });
          return;
        }

        const manageableByUser = await canManageVoiceInterfaceChannel(interaction, target.id);
        if (!manageableByUser) {
          await interaction.reply({ content: '자신이 만든 통화방(또는 관리자 권한)만 관리할 수 있어요.', ephemeral: true });
          return;
        }

        if (!target.manageable) {
          await interaction.reply({ content: '이 채널은 봇이 수정할 수 없어요.', ephemeral: true });
          return;
        }

        if (action === 'region') {
          const region = value === 'auto' ? null : value;
          await target.setRTCRegion(region, `voice interface region by ${interaction.user.tag}`);
          await saveVoiceRoomTemplateFromChannel(interaction.user.id, target);
          await interaction.reply({ content: region ? `통화방 리전을 ${region}으로 변경했어요.` : '통화방 리전을 자동(AUTO)으로 설정했어요.', ephemeral: true });
          return;
        }

        if (action === 'limit') {
          const nextLimit = value === '1' ? 1 : value === '2' ? 2 : 0;
          await target.setUserLimit(nextLimit, `voice interface limit by ${interaction.user.tag}`);
          await saveVoiceRoomTemplateFromChannel(interaction.user.id, target);
          await interaction.reply({
            content: nextLimit > 0 ? `인원 제한을 ${nextLimit}명으로 설정했어요.` : '인원 제한을 해제했어요.',
            ephemeral: true,
          });
          return;
        }

        if (action === 'lock' || action === 'unlock') {
          await setVoiceRoomLock(target, interaction.user.id, action === 'lock', `voice interface ${action} by ${interaction.user.tag}`);
          await saveVoiceRoomTemplateFromChannel(interaction.user.id, target);
          await interaction.reply({
            content: action === 'lock' ? '통화방을 잠갔어요. (일반 유저 입장 제한)' : '통화방 잠금을 해제했어요.',
            ephemeral: true,
          });
          return;
        }

        if (action === 'delete') {
          const roomName = target.name;
          await saveVoiceRoomTemplateFromChannel(interaction.user.id, target);
          await forgetVoiceAutoRoom(target.id).catch(() => null);
          await target.delete(`voice interface delete by ${interaction.user.tag}`);
          await interaction.reply({
            content: `통화방 **${roomName}** 을(를) 삭제했어요.`,
            ephemeral: true,
          });
          return;
        }

        await interaction.reply({ content: '알 수 없는 인터페이스 동작이에요.', ephemeral: true });
        return;
      }

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

      if (interaction.customId === 'music_filter_open') {
        if (!interaction.guildId) {
          await interaction.reply({ embeds: [buildMusicStatusEmbed('🚫 서버 전용', '서버에서만 사용할 수 있어요.')], ephemeral: true });
          return;
        }

        const music = getMusic();
        const player = music.players.get(interaction.guildId);
        if (!player) {
          await interaction.reply({
            embeds: [buildMusicStatusEmbed('🎵 재생 없음', '필터를 적용하려면 먼저 음악을 재생해 주세요.')],
            ephemeral: true
          });
          return;
        }

        const selected = toFilterPreset(player.data.get('music_filter_preset'));
        pendingFilterSelection.set(filterSelectionKey(interaction.guildId, interaction.user.id), selected);

        await interaction.reply({
          embeds: [buildMusicStatusEmbed('🎛️ 필터 설정', `현재 필터: **${MUSIC_FILTER_LABELS[selected]}**\n\n드롭다운에서 선택 후 적용 버튼을 눌러주세요.`)],
          components: buildFilterRows(selected),
          ephemeral: true
        });
        return;
      }

      if (interaction.customId === 'music_autoplay_toggle') {
        if (!interaction.guildId) {
          await interaction.reply({ embeds: [buildMusicStatusEmbed('🚫 서버 전용', '서버에서만 사용할 수 있어요.')], ephemeral: true });
          return;
        }

        const music = getMusic();
        const player = music.players.get(interaction.guildId);
        if (!player) {
          await interaction.reply({
            embeds: [buildMusicStatusEmbed('🎵 재생 없음', '자동재생을 바꾸려면 먼저 음악을 재생해 주세요.')],
            ephemeral: true
          });
          return;
        }

        const current = player.data.get('music_autoplay') !== false;
        const next = !current;
        player.data.set('music_autoplay', next);

        await logMusicControlInteraction({
          guildId: interaction.guildId,
          action: 'set_autoplay',
          status: 'requested',
          message: 'Discord autoplay toggle requested.',
          requestedBy: interaction.user.id,
          payload: {
            source: 'discord_button',
            custom_id: interaction.customId,
            autoplay: next
          }
        });

        await updateMusicSetupMessage(player, player.queue.current ?? null).catch(() => {});
        await updateMusicState(player).catch(() => {});

        await logMusicControlInteraction({
          guildId: interaction.guildId,
          action: 'set_autoplay',
          status: 'success',
          message: `Autoplay ${next ? 'enabled' : 'disabled'} via Discord button.`,
          requestedBy: interaction.user.id,
          payload: {
            source: 'discord_button',
            custom_id: interaction.customId,
            autoplay: next
          }
        });

        await interaction.reply({
          embeds: [buildMusicStatusEmbed('♾️ 자동재생 설정', `자동재생이 **${next ? '켜짐' : '꺼짐'}** 상태로 바뀌었습니다.`)],
          ephemeral: true
        });
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

      if (interaction.customId === 'music_filter_apply') {
        if (!interaction.guildId) {
          await interaction.reply({ embeds: [buildMusicStatusEmbed('🚫 서버 전용', '서버에서만 사용할 수 있어요.')], ephemeral: true });
          return;
        }

        const music = getMusic();
        const player = music.players.get(interaction.guildId);
        if (!player) {
          await interaction.reply({ embeds: [buildMusicStatusEmbed('🎵 재생 없음', '필터를 적용할 재생 세션이 없습니다.')], ephemeral: true });
          return;
        }

        await interaction.deferUpdate();
        const key = filterSelectionKey(interaction.guildId, interaction.user.id);
        const selected = pendingFilterSelection.get(key) ?? toFilterPreset(player.data.get('music_filter_preset'));

        await logMusicControlInteraction({
          guildId: interaction.guildId,
          action: 'set_filter',
          status: 'requested',
          message: 'Discord filter apply requested.',
          requestedBy: interaction.user.id,
          payload: {
            source: 'discord_button',
            custom_id: interaction.customId,
            filter: selected
          }
        });

        try {
          await applyMusicFilterPreset(player, selected);
          pendingFilterSelection.delete(key);

          await updateMusicSetupMessage(player, player.queue.current ?? null).catch(() => {});
          await updateMusicState(player).catch(() => {});

          await logMusicControlInteraction({
            guildId: interaction.guildId,
            action: 'set_filter',
            status: 'success',
            message: `Filter ${selected} applied from Discord controls.`,
            requestedBy: interaction.user.id,
            payload: {
              source: 'discord_button',
              custom_id: interaction.customId,
              filter: selected
            }
          });

          await interaction.editReply({
            embeds: [buildMusicStatusEmbed('🎛️ 필터 적용 완료', `현재 필터: **${MUSIC_FILTER_LABELS[selected]}**`)],
            components: buildFilterRows(selected)
          });
        } catch (error) {
          await logMusicControlInteraction({
            guildId: interaction.guildId,
            action: 'set_filter',
            status: 'failed',
            message: error instanceof Error ? error.message : 'Filter apply failed.',
            requestedBy: interaction.user.id,
            payload: {
              source: 'discord_button',
              custom_id: interaction.customId,
              filter: selected
            }
          });

          await interaction.editReply({
            embeds: [buildMusicStatusEmbed('❌ 필터 적용 실패', '필터를 적용하지 못했습니다. 잠시 후 다시 시도해 주세요.')],
            components: buildFilterRows(selected)
          });
        }
        return;
      }

      if (['music_prev', 'music_play', 'music_pause', 'music_stop', 'music_next'].includes(interaction.customId)) {
        const actionMap = {
          music_prev: 'previous',
          music_play: 'play',
          music_pause: 'pause',
          music_stop: 'stop',
          music_next: 'skip',
        } as const;
        const action = actionMap[interaction.customId as keyof typeof actionMap];
        const basePayload = {
          source: 'discord_button',
          custom_id: interaction.customId,
        };

        const failWithLog = async (
          title: string,
          description: string,
          payload: Record<string, string | number | boolean | null> = {},
        ) => {
          await logMusicControlInteraction({
            guildId: interaction.guildId,
            action,
            status: 'failed',
            message: description,
            requestedBy: interaction.user.id,
            payload: { ...basePayload, ...payload },
          });
          await interaction.reply({ embeds: [buildMusicStatusEmbed(title, description)], ephemeral: true });
        };

        const successWithLog = async (
          title: string,
          description: string,
          payload: Record<string, string | number | boolean | null> = {},
        ) => {
          await logMusicControlInteraction({
            guildId: interaction.guildId,
            action,
            status: 'success',
            message: description,
            requestedBy: interaction.user.id,
            payload: { ...basePayload, ...payload },
          });
          await interaction.reply({ embeds: [buildMusicStatusEmbed(title, description)], ephemeral: true });
        };

        await logMusicControlInteraction({
          guildId: interaction.guildId,
          action,
          status: 'requested',
          message: 'Discord music button control requested.',
          requestedBy: interaction.user.id,
          payload: basePayload,
        });

        if (!interaction.guildId) {
          await interaction.reply({ embeds: [buildMusicStatusEmbed('🚫 서버 전용', '서버에서만 사용할 수 있어요.')], ephemeral: true });
          return;
        }

        const music = getMusic();
        const player = music.players.get(interaction.guildId);
        if (!player) {
          await failWithLog('🎵 재생 없음', '현재 재생 중인 음악이 없습니다.');
          return;
        }

        const voiceId = getVoiceChannelId(interaction);
        if (!voiceId) {
          await failWithLog('🎧 음성 채널 필요', '먼저 음성 채널에 들어가주세요.');
          return;
        }

        if (player.voiceId && player.voiceId !== voiceId) {
          await failWithLog('🚫 다른 음성 채널', '현재 재생 중인 채널에서만 조작할 수 있어요.', {
            user_voice_id: voiceId,
            player_voice_id: player.voiceId,
          });
          return;
        }

        if (interaction.customId === 'music_prev') {
          const previous = player.getPrevious(true);
          if (!previous) {
            await failWithLog('⏮️ 이전 곡 없음', '이전 곡이 없습니다.');
            return;
          }
          await player.play(previous);
          updateMusicSetupMessage(player, previous).catch(() => {});
          scheduleMusicStateUpdate(player);
          await successWithLog('⏮️ 이전 곡', '이전 곡으로 이동했어요.', {
            track_id: previous.track,
            track_title: previous.title,
          });
          return;
        }

        if (interaction.customId === 'music_play') {
          if (player.playing && !player.paused) {
            await failWithLog('▶️ 재생 중', '이미 재생 중입니다.');
            return;
          }
          if (player.paused) {
            player.pause(false);
          } else {
            await player.play();
          }
          scheduleMusicStateUpdate(player);
          await successWithLog('▶️ 재생', '재생을 시작했어요.');
          return;
        }

        if (interaction.customId === 'music_pause') {
          if (!player.playing || player.paused) {
            await failWithLog('⏸️ 일시정지', '이미 일시정지 상태입니다.');
            return;
          }
          player.pause(true);
          scheduleMusicStateUpdate(player);
          await successWithLog('⏸️ 일시정지', '재생을 일시정지했어요.');
          return;
        }

        if (interaction.customId === 'music_stop') {
          player.destroy();
          updateMusicSetupMessage(player, null).catch(() => {});
          clearMusicState(player.guildId).catch(() => {});
          await successWithLog('⏹️ 정지', '재생을 중지했어요.');
          return;
        }

        if (interaction.customId === 'music_next') {
          player.skip();
          scheduleMusicStateUpdate(player);
          await successWithLog('⏭️ 다음 곡', '다음 곡으로 이동했어요.');
          return;
        }
      }
    }
  });
}
