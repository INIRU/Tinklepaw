import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from './types.js';
import { getBotContext } from '../context.js';

export const helpCommand: SlashCommand = {
  name: 'help',
  json: new SlashCommandBuilder()
    .setName('help')
    .setNameLocalizations({ ko: '도움말' })
    .setDescription('사용 가능한 명령어 목록을 보여줍니다.')
    .toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    const ctx = getBotContext();
    const { data: cfg } = await ctx.supabase.from('app_config').select('*').single();
    const webUrl = (ctx.env.NYARU_WEB_URL || 'https://tinklepaw.vercel.app').replace(/\/+$/, '');
    const drawUrl = `${webUrl}/draw`;

    type AppConfigRow = {
      help_embed_title?: string | null;
      help_embed_color?: string | null;
      help_embed_description?: string | null;
      help_embed_footer_text?: string | null;
      help_embed_show_timestamp?: boolean | null;
      help_embed_fields?: Array<{ name: string; value: string; inline?: boolean }> | null;
    };
    const config = cfg as AppConfigRow | null;
    const title = config?.help_embed_title || '💕 방울냥 봇 도움말';
    const color = config?.help_embed_color || '#FF69B4';
    const description = config?.help_embed_description || '사용 가능한 명령어 목록이야!';
    const footerText = config?.help_embed_footer_text || 'Nyaru Bot';
    const showTimestamp = config?.help_embed_show_timestamp !== false; // Default true
    
    // Default fields if not configured
    const defaultFields = [
      { name: '/뽑기', value: `가챠를 돌려 역할을 뽑아봐!\n💡 더 멋진 연출은 [웹사이트](${drawUrl})에서!`, inline: true },
      { name: '/일일상자', value: '하루 1번 보물상자를 열고 포인트 보상을 받아!', inline: true },
      { name: '/복권', value: '즉석 복권 1장을 500p에 구매하고 당첨금을 노려봐!', inline: true },
      { name: '/가방', value: '보유한 아이템 목록을 확인해.', inline: true },
      { name: '/음악', value: '노래를 재생하고 대기열을 관리해.', inline: true },
      { name: '/장착 [이름]', value: '아이템을 장착하고 역할을 받아.', inline: false },
      { name: '/해제', value: '장착 중인 아이템을 해제해.', inline: true },
      { name: '/웹', value: `웹 UI 링크를 바로 안내해줘.\n[웹 홈](${webUrl})`, inline: true },
      { name: '대화하기', value: '나(방울냥)를 멘션하거나 답장하면 대화할 수 있어!', inline: false },
      { name: '미니게임', value: '"가위바위보" 또는 "끝말잇기"라고 말해봐!', inline: true },
      { name: '🌐 웹사이트', value: `[${webUrl.replace(/^https?:\/\//, '')}](${webUrl})에서 더 편리하게 뽑기 연출과 인벤토리를 확인할 수 있어요!`, inline: false }
    ];

    const fields = config?.help_embed_fields && Array.isArray(config.help_embed_fields) 
      ? config.help_embed_fields 
      : defaultFields;

    const embed = new EmbedBuilder()
      .setColor(color as `#${string}`)
      .setTitle(title)
      .setDescription(description)
      .addFields(fields)
      .setFooter({ text: footerText, iconURL: interaction.client.user.displayAvatarURL() });

    if (showTimestamp) {
      embed.setTimestamp();
    }

    await interaction.reply({ embeds: [embed] });
  }
};
