import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ChatInputCommandInteraction,
  type Message,
  type MessageComponentInteraction,
} from 'discord.js';

import type { SlashCommand } from './types.js';
import { getBotContext } from '../context.js';
import { brandEmbed, successEmbed, errorEmbed, Colors, RarityEmoji } from '../lib/embed.js';
import { getServerEmoji } from '../lib/serverEmoji.js';

type OwnedItem = {
  item_id: string;
  qty: number;
  items: {
    name: string;
    rarity: string;
    discord_role_id: string | null;
  } | null;
};

const RARITY_ORDER: Record<string, number> = { SSS: 0, SS: 1, S: 2, R: 3 };

export const equipCommand: SlashCommand = {
  name: 'equip',
  json: new SlashCommandBuilder()
    .setName('equip')
    .setNameLocalizations({ ko: '장착' })
    .setDescription('아이템을 장착하여 역할을 받습니다.')
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction) {
    const ctx = getBotContext();
    if (!interaction.guildId || interaction.guildId !== ctx.env.NYARU_GUILD_ID) {
      await interaction.reply({ content: '이 명령어는 지정된 서버에서만 사용할 수 있어요.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const userId = interaction.user.id;

    // Fetch user's owned equippable items
    const { data, error } = await ctx.supabase
      .from('inventory')
      .select('item_id, qty, items:items(name, rarity, discord_role_id)')
      .eq('discord_user_id', userId)
      .gt('qty', 0)
      .limit(25);

    if (error) {
      await interaction.editReply({ embeds: [errorEmbed('인벤토리 로드 실패', '잠시 후 다시 시도해주세요.')] });
      return;
    }

    const owned = (data ?? []) as unknown as OwnedItem[];
    const equippable = owned.filter(o => o.items?.discord_role_id);

    if (equippable.length === 0) {
      await interaction.editReply({
        embeds: [brandEmbed()
          .setColor(Colors.COOLDOWN)
          .setTitle('📦 장착 가능한 아이템이 없어요')
          .setDescription('`/뽑기`로 역할 아이템을 먼저 획득해보세요!')
          .setFooter({ text: '방울냥 · 장착' })],
      });
      return;
    }

    // Sort by rarity
    equippable.sort((a, b) => {
      const ra = RARITY_ORDER[a.items?.rarity ?? 'R'] ?? 99;
      const rb = RARITY_ORDER[b.items?.rarity ?? 'R'] ?? 99;
      return ra - rb;
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('equip:select')
      .setPlaceholder('장착할 아이템을 선택하세요')
      .addOptions(
        equippable.map((item) => {
          const rarity = item.items?.rarity ?? 'R';
          const emoji = RarityEmoji[rarity] ?? '🔹';
          return new StringSelectMenuOptionBuilder()
            .setLabel(item.items?.name ?? '알 수 없음')
            .setDescription(`${rarity} 등급 · ${item.qty}개 보유`)
            .setValue(item.item_id)
            .setEmoji(emoji);
        }),
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const stars = getServerEmoji(interaction.client, 'stars', '✨');
    const catPaw = getServerEmoji(interaction.client, 'catPaw', '🐾');

    const embed = brandEmbed()
      .setColor(Colors.BRAND_LAVENDER)
      .setTitle(`${stars} 아이템 장착`)
      .setDescription(`${catPaw} 장착할 아이템을 아래에서 선택하세요.`)
      .setFooter({ text: `방울냥 · ${equippable.length}개 장착 가능` });

    await interaction.editReply({ embeds: [embed], components: [row] });

    const reply = await interaction.fetchReply();
    if (!('createMessageComponentCollector' in reply)) return;

    const collector = (reply as Message).createMessageComponentCollector({
      filter: (i: MessageComponentInteraction) => i.user.id === userId,
      time: 60_000,
    });

    collector.on('collect', async (menuInteraction: MessageComponentInteraction) => {
      if (!menuInteraction.isStringSelectMenu() || menuInteraction.customId !== 'equip:select') return;

      const selectedItemId = menuInteraction.values[0];
      const selected = equippable.find(it => it.item_id === selectedItemId);

      await menuInteraction.deferUpdate();

      const { error: equipError } = await ctx.supabase.rpc('set_equipped_item', {
        p_discord_user_id: userId,
        p_item_id: selectedItemId,
      });

      if (equipError) {
        const msg = equipError.message === 'ITEM_NOT_OWNED'
          ? '보유하지 않은 아이템이에요.'
          : '장착 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.';
        await interaction.editReply({ embeds: [errorEmbed('장착 실패', msg)], components: [] });
        collector.stop();
        return;
      }

      const itemName = selected?.items?.name ?? '아이템';
      const roleId = selected?.items?.discord_role_id;

      const result = successEmbed('장착 완료!')
        .setDescription(`**${itemName}** 장착!${roleId ? `\n<@&${roleId}> 역할이 적용됩니다.` : ''}`);

      await interaction.editReply({ embeds: [result], components: [] });
      collector.stop();
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        interaction.editReply({ components: [] }).catch(() => {});
      }
    });
  },
};
