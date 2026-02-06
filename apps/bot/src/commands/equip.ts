import { SlashCommandBuilder } from 'discord.js';

import type { ChatInputCommandInteraction } from 'discord.js';

import type { SlashCommand } from './types.js';
import { getBotContext } from '../context.js';

type EquipCandidate = {
  item_id: string;
  name: string;
  rarity: string;
};

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j += 1) prev[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }

  return prev[b.length];
}

function similarityScore(query: string, target: string): number {
  if (query === target) return 1;

  const maxLen = Math.max(query.length, target.length);
  if (maxLen === 0) return 0;

  const base = 1 - (levenshteinDistance(query, target) / maxLen);
  const startsWithBonus = target.startsWith(query) || query.startsWith(target) ? 0.08 : 0;
  const includesBonus = target.includes(query) || query.includes(target) ? 0.04 : 0;
  return Math.min(1, base + startsWithBonus + includesBonus);
}

function findBestItemMatch(input: string, candidates: EquipCandidate[]) {
  const normalizedInput = normalizeForMatch(input);
  if (!normalizedInput) {
    return { best: null as EquipCandidate | null, score: 0, secondScore: 0 };
  }

  const scored = candidates.map((item) => {
    const normalizedName = normalizeForMatch(item.name);
    return {
      item,
      score: similarityScore(normalizedInput, normalizedName)
    };
  }).sort((a, b) => b.score - a.score);

  return {
    best: scored[0]?.item ?? null,
    score: scored[0]?.score ?? 0,
    secondScore: scored[1]?.score ?? 0
  };
}

export const equipCommand: SlashCommand = {
  name: 'equip',
  json: new SlashCommandBuilder()
    .setName('equip')
    .setNameLocalizations({ ko: '장착' })
    .setDescription('아이템을 장착하여 역할을 받습니다.')
    .addStringOption((opt) => opt
      .setName('name')
      .setNameLocalizations({ ko: '이름' })
      .setDescription('아이템 이름')
      .setRequired(true))
    .toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    const ctx = getBotContext();
    if (!interaction.guildId || interaction.guildId !== ctx.env.NYARU_GUILD_ID) {
      await interaction.reply({ content: '이 명령어는 지정된 서버에서만 사용할 수 있습니다.', ephemeral: true });
      return;
    }

    const rawName = interaction.options.getString('name', true);
    const name = rawName.trim();

    if (!name) {
      await interaction.reply({ content: '아이템 이름을 입력해주세요.', ephemeral: true });
      return;
    }

    const { data: items, error: itemErr } = await ctx.supabase
      .from('items')
      .select('item_id, name, rarity')
      .eq('is_active', true)
      .eq('is_equippable', true)
      .limit(200);

    if (itemErr || !items || items.length === 0) {
      await interaction.reply({ content: '장착 가능한 아이템 목록을 불러오지 못했습니다.', ephemeral: true });
      return;
    }

    const candidates = items as EquipCandidate[];
    const { best: matchedItem, score, secondScore } = findBestItemMatch(name, candidates);

    if (!matchedItem || score < 0.55) {
      const suggestions = candidates
        .slice(0, 5)
        .map((candidate) => `• ${candidate.name}`)
        .join('\n');
      await interaction.reply({
        content: `아이템을 찾을 수 없습니다. 아래 이름으로 다시 시도해보세요.\n${suggestions}`,
        ephemeral: true
      });
      return;
    }

    if (secondScore >= 0.6 && score - secondScore < 0.08) {
      const nearby = candidates
        .map((candidate) => ({ candidate, score: similarityScore(normalizeForMatch(name), normalizeForMatch(candidate.name)) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(({ candidate }) => `• ${candidate.name}`)
        .join('\n');
      await interaction.reply({
        content: `비슷한 아이템이 여러 개 있어요. 조금 더 정확히 입력해주세요.\n${nearby}`,
        ephemeral: true
      });
      return;
    }

    const { data, error } = await ctx.supabase.rpc('set_equipped_item', {
      p_discord_user_id: interaction.user.id,
      p_item_id: matchedItem.item_id
    });

    if (error) {
      const msg = error.message === 'ITEM_NOT_OWNED' ? '보유하지 않은 아이템입니다.' : `장착 실패: ${error.message}`;
      await interaction.reply({ content: msg, ephemeral: true });
      return;
    }

    const row = Array.isArray(data) ? data[0] : null;
    const fuzzyMatched = normalizeForMatch(name) !== normalizeForMatch(matchedItem.name);
    const equippedLabel = fuzzyMatched ? `${matchedItem.name} (입력값: ${name})` : matchedItem.name;

    await interaction.reply({
      content: row?.previous_role_id && row?.new_role_id && row.previous_role_id !== row.new_role_id
        ? `**${equippedLabel}** 장착 완료. 역할을 업데이트합니다...`
        : `**${equippedLabel}** 장착 완료.`
    });
  }
};
