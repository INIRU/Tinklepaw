import { EmbedBuilder, type User } from 'discord.js';
import type { BotContext } from '../context.js';

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

  const items = data || [];
  const lines = items.map((row: { qty: number; items: unknown }) => {
    const item = row.items as unknown as { name: string; rarity: string } | null;
    const label = item ? `${item.name} (${item.rarity})` : 'Unknown item';
    return `- ${label} x${row.qty}`;
  });

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
    .replace('{itemCount}', items.reduce((acc: number, curr: { qty: number }) => acc + curr.qty, 0).toLocaleString());

  const embed = new EmbedBuilder()
    .setTitle(embedTitle)
    .setColor(embedColor as `#${string}`)
    .setDescription(description);

  if (lines.length > 0) {
    embed.addFields({ name: '보유 아이템', value: lines.join('\n') });
  } else {
    embed.addFields({ name: '보유 아이템', value: '비어있음' });
  }

  return embed;
}
