import { EmbedBuilder, type User } from 'discord.js';
import type { BotContext } from '../context.js';

type InventoryRow = {
  qty: number;
  items: {
    name: string;
    rarity: string;
  } | null;
};

const RARITY_ORDER = ['SSS', 'SS', 'S', 'R'] as const;

const RARITY_LABEL: Record<string, string> = {
  SSS: '🌈 SSS',
  SS: '💎 SS',
  S: '✨ S',
  R: '🟦 R'
};

function normalizeRarity(rarity: string | null | undefined): string {
  if (!rarity) return 'R';
  const upper = rarity.toUpperCase();
  return RARITY_LABEL[upper] ? upper : 'R';
}

export async function generateInventoryEmbed(ctx: BotContext, user: User) {
  const { data: cfg } = await ctx.supabase.from('app_config').select('*').single();
  const { data: balanceData } = await ctx.supabase.from('point_balances').select('balance').eq('discord_user_id', user.id).single();
  
  const { data, error } = await ctx.supabase
    .from('inventory')
    .select('qty, items:items(name, rarity)')
    .eq('discord_user_id', user.id)
    .gt('qty', 0)
    .order('qty', { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`인벤토리를 불러오지 못했습니다: ${error.message}`);
  }

  const items = (data || []) as unknown as InventoryRow[];
  const totalQty = items.reduce((acc, curr) => acc + curr.qty, 0);

  const grouped: Record<string, string[]> = {
    SSS: [],
    SS: [],
    S: [],
    R: []
  };

  for (const row of items) {
    if (!row.items) continue;
    const rarity = normalizeRarity(row.items.rarity);
    grouped[rarity].push(`• ${row.items.name} ×${row.qty}`);
  }

  type AppConfigRow = {
    inventory_embed_title?: string | null;
    inventory_embed_color?: string | null;
    inventory_embed_description?: string | null;
  };
  const config = cfg as AppConfigRow | null;
  const embedTitle = config?.inventory_embed_title || '🎒 인벤토리';
  const embedColor = config?.inventory_embed_color || '#5865F2';
  const embedDescTemplate = config?.inventory_embed_description || '{user}님의 인벤토리입니다.\n현재 포인트: **{points}p**';

  const description = embedDescTemplate
    .replace('{user}', user.username)
    .replace('{points}', (balanceData?.balance ?? 0).toLocaleString())
    .replace('{itemCount}', totalQty.toLocaleString());

  const embed = new EmbedBuilder()
    .setTitle(embedTitle)
    .setColor(embedColor as `#${string}`)
    .setDescription(description)
    .setThumbnail(user.displayAvatarURL())
    .setFooter({ text: '장착: /장착 이름 • 해제: /해제' })
    .setTimestamp();

  if (items.length === 0) {
    embed.addFields(
      { name: '요약', value: '총 0종 / 0개', inline: true },
      { name: '보유 아이템', value: '비어있음. /뽑기 로 아이템을 획득해보세요.' }
    );
    return embed;
  }

  embed.addFields({
    name: '요약',
    value: `총 **${items.length.toLocaleString()}종** / **${totalQty.toLocaleString()}개**`,
    inline: true
  });

  for (const rarity of RARITY_ORDER) {
    const lines = grouped[rarity];
    if (lines.length === 0) continue;
    embed.addFields({
      name: RARITY_LABEL[rarity],
      value: lines.join('\n').slice(0, 1000)
    });
  }

  return embed;
}
