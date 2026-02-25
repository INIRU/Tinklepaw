import { EmbedBuilder } from 'discord.js';

/* ──────────── Brand Colors ──────────── */
export const Colors = {
  BRAND_PINK: 0xff5fa2,
  BRAND_PINK_2: 0xff8bc2,
  BRAND_LAVENDER: 0xbca7ff,
  BRAND_SKY: 0x78b7ff,
  BRAND_MINT: 0x39d3b3,
  BRAND_LEMON: 0xffd36a,

  SUCCESS: 0x22c55e,
  ERROR: 0xef4444,
  WARNING: 0xf59e0b,
  INFO: 0x5865f2,
  COOLDOWN: 0x64748b,

  RARITY_SSS: 0xfbbf24,
  RARITY_SS: 0xa855f7,
  RARITY_S: 0x3b82f6,
  RARITY_R: 0x94a3b8,

  TIER_COMMON: 0x9ca3af,
  TIER_RARE: 0x38bdf8,
  TIER_EPIC: 0xc084fc,
  TIER_LEGENDARY: 0xfbbf24,

  STOCK_UP: 0xef4444,
  STOCK_DOWN: 0x3b82f6,
} as const;

export const RarityColor: Record<string, number> = {
  SSS: Colors.RARITY_SSS,
  SS: Colors.RARITY_SS,
  S: Colors.RARITY_S,
  R: Colors.RARITY_R,
};

export const RarityEmoji: Record<string, string> = {
  SSS: '🌈',
  SS: '💎',
  S: '✨',
  R: '🔹',
};

export const RarityLabel: Record<string, string> = {
  SSS: '🌈 SSS 등급',
  SS: '💎 SS 등급',
  S: '✨ S 등급',
  R: '🔹 R 등급',
};

/* ──────────── Visual Helpers ──────────── */
export const LINE = '───────────────────────';
export const DOT_LINE = '· · · · · · · · · · · ·';

export function progressBar(current: number, max: number, length = 10): string {
  const ratio = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(ratio * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

export function formatPoints(points: number): string {
  return `\`${points.toLocaleString('ko-KR')}P\``;
}

export function signedPoints(value: number): string {
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${value.toLocaleString('ko-KR')}P`;
}

export function signedPct(value: number): string {
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

export function statLine(emoji: string, label: string, value: string): string {
  return `${emoji} ${label}  ${value}`;
}

export function statBlock(items: Array<{ emoji: string; label: string; value: string }>): string {
  return items.map(i => statLine(i.emoji, i.label, `**${i.value}**`)).join('\n');
}

/* ──────────── Embed Builders ──────────── */

export function brandEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.BRAND_PINK)
    .setTimestamp();
}

export function successEmbed(title: string, description?: string): EmbedBuilder {
  const e = brandEmbed().setColor(Colors.SUCCESS).setTitle(`✅ ${title}`);
  if (description) e.setDescription(description);
  return e;
}

export function errorEmbed(title: string, description?: string): EmbedBuilder {
  const e = brandEmbed().setColor(Colors.ERROR).setTitle(`❌ ${title}`);
  if (description) e.setDescription(description);
  return e;
}

export function warningEmbed(title: string, description?: string): EmbedBuilder {
  const e = brandEmbed().setColor(Colors.WARNING).setTitle(`⚠️ ${title}`);
  if (description) e.setDescription(description);
  return e;
}

export function cooldownEmbed(title: string, description: string): EmbedBuilder {
  return brandEmbed()
    .setColor(Colors.COOLDOWN)
    .setTitle(`⏳ ${title}`)
    .setDescription(description);
}

export function infoEmbed(title: string, description?: string): EmbedBuilder {
  const e = brandEmbed().setColor(Colors.INFO).setTitle(title);
  if (description) e.setDescription(description);
  return e;
}

export function parseHexColor(color: string | undefined): number {
  if (!color) return Colors.BRAND_PINK;
  if (color.startsWith('#')) return parseInt(color.slice(1), 16) || Colors.BRAND_PINK;
  return parseInt(color, 16) || Colors.BRAND_PINK;
}
