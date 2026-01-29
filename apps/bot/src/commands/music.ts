import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';

import type { SlashCommand } from './types.js';
import { getAppConfig } from '../services/config.js';
import { formatDuration, getMusic, getNodeStatus, updateMusicSetupMessage } from '../services/music.js';

const baseColor = 0x3b82f6;

const buildStatusEmbed = (title: string, description: string) =>
  new EmbedBuilder().setTitle(title).setDescription(description).setColor(baseColor);

const getVoiceChannelId = (interaction: ChatInputCommandInteraction): string | null => {
  const member = interaction.member as GuildMember | null;
  const channel = member?.voice?.channel;
  return channel?.id ?? null;
};

export const musicCommand: SlashCommand = {
  name: 'music',
  json: new SlashCommandBuilder()
    .setName('music')
    .setNameLocalizations({ ko: '음악' })
    .setDescription('음악을 재생하고 관리합니다.')
    .addSubcommand((sub) =>
      sub
        .setName('play')
        .setNameLocalizations({ ko: '재생' })
        .setDescription('음악을 재생합니다.')
        .addStringOption((opt) =>
          opt
            .setName('query')
            .setNameLocalizations({ ko: '검색' })
            .setDescription('검색어 또는 URL')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('pause').setNameLocalizations({ ko: '일시정지' }).setDescription('음악을 일시정지합니다.')
    )
    .addSubcommand((sub) =>
      sub.setName('resume').setNameLocalizations({ ko: '재개' }).setDescription('음악을 다시 재생합니다.')
    )
    .addSubcommand((sub) =>
      sub.setName('skip').setNameLocalizations({ ko: '스킵' }).setDescription('현재 곡을 스킵합니다.')
    )
    .addSubcommand((sub) =>
      sub.setName('stop').setNameLocalizations({ ko: '정지' }).setDescription('재생을 중지하고 나갑니다.')
    )
    .addSubcommand((sub) =>
      sub.setName('queue').setNameLocalizations({ ko: '대기열' }).setDescription('대기열을 보여줍니다.')
    )
    .addSubcommand((sub) =>
      sub.setName('nowplaying').setNameLocalizations({ ko: '현재곡' }).setDescription('현재 재생 중인 곡을 보여줍니다.')
    )
    .toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    const music = getMusic();
    const sub = interaction.options.getSubcommand();
    const config = await getAppConfig().catch(() => null);
    if (config?.music_command_channel_id && interaction.channelId !== config.music_command_channel_id) {
      await interaction.reply({
        embeds: [
          buildStatusEmbed(
            '📍 음악 채널 안내',
            `음악 명령어는 <#${config.music_command_channel_id}> 채널에서만 사용할 수 있어요.`
          )
        ],
        ephemeral: true
      });
      return;
    }

    if (sub === 'play') {
      const query = interaction.options.getString('query', true);
      const voiceId = getVoiceChannelId(interaction);
      if (!voiceId) {
        await interaction.reply({ embeds: [buildStatusEmbed('🎧 음성 채널 필요', '먼저 음성 채널에 들어가주세요.')], ephemeral: true });
        return;
      }

      const nodeStatus = getNodeStatus(music);
      if (!nodeStatus.ready) {
        await interaction.reply({
          embeds: [
            buildStatusEmbed(
              '🚫 Lavalink 연결 없음',
              `${nodeStatus.summary}\n\n서버 상태와 비밀번호(LAVALINK_SERVER_PASSWORD)를 확인해 주세요.`
            )
          ],
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply();

      const player = await music.createPlayer({
        guildId: interaction.guildId as string,
        textId: interaction.channelId,
        voiceId,
        volume: 60
      });

      const searchResult = await music.search(query, { requester: interaction.user });
      if (!searchResult.tracks.length) {
        await interaction.editReply({ embeds: [buildStatusEmbed('🔎 검색 실패', '검색 결과가 없습니다. 다른 검색어를 시도해 보세요.')] });
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
              .setColor(baseColor)
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
          .setColor(baseColor)
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
      return;
    }

    const player = music.players.get(interaction.guildId as string);
    if (!player) {
      await interaction.reply({ embeds: [buildStatusEmbed('🎵 재생 없음', '현재 재생 중인 음악이 없습니다.')], ephemeral: true });
      return;
    }

    if (sub === 'pause') {
      player.pause(true);
      await interaction.reply({ embeds: [buildStatusEmbed('⏸️ 일시정지', '재생을 멈췄습니다.')] });
      return;
    }

    if (sub === 'resume') {
      player.pause(false);
      await interaction.reply({ embeds: [buildStatusEmbed('▶️ 재개', '다시 재생합니다.')] });
      return;
    }

    if (sub === 'skip') {
      player.skip();
      await interaction.reply({ embeds: [buildStatusEmbed('⏭️ 스킵', '다음 곡으로 넘어갑니다.')] });
      return;
    }

    if (sub === 'stop') {
      player.destroy();
      await interaction.reply({ embeds: [buildStatusEmbed('🛑 정지', '재생을 중지하고 나갔습니다.')] });
      return;
    }

    if (sub === 'nowplaying') {
      const current = player.queue.current;
      if (!current) {
        await interaction.reply({ embeds: [buildStatusEmbed('🎵 재생 없음', '현재 재생 중인 곡이 없습니다.')], ephemeral: true });
        return;
      }
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🎶 현재 재생 중')
            .setDescription(`[${current.title}](${current.uri})`)
            .addFields(
              { name: '아티스트', value: current.author || '알 수 없음', inline: true },
              { name: '길이', value: current.length ? `${Math.floor(current.length / 1000)}초` : 'LIVE', inline: true }
            )
            .setColor(baseColor)
        ]
      });
      return;
    }

    if (sub === 'queue') {
      const current = player.queue.current;
      const upcoming = player.queue.slice(0, 10);
      const lines = upcoming.map((track, idx) => `${idx + 1}. ${track.title}`).join('\n');
      const description = `${current ? `지금 재생 중: **${current.title}**\n\n` : ''}${lines || '대기열이 비어있습니다.'}`;

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('📜 대기열')
            .setDescription(description)
            .setColor(baseColor)
        ]
      });
    }
  }
};
