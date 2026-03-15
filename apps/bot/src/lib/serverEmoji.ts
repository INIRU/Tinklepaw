import type { Client, Guild } from 'discord.js';

import { getBotContext } from '../context.js';

/**
 * Commonly used server emoji names mapped to semantic aliases.
 * These are resolved at runtime from the guild's emoji cache.
 */
const EMOJI_ALIASES: Record<string, string> = {
  // System / Decoration
  boost: '0_BOOST',
  heart: '0_hrt',
  heart2: '0_hrt2',
  heart3: '0_hrt3',
  stars: '0_stars',
  catPaw: '0_cat_paw',
  pinkZzz: '0_pinkzzz',

  // Cat expressions
  catYes: '1_cat_yes',
  catNo: '1_cat_no',
  cat: '1_cat',
  catHappy: '1_cat2',
  catShy: '1_cat3',

  // Chii
  chii: '2_Chii',
  chiiHappy: '2_Chii2',

  // Hachi
  hach: '3_Hach',
  hachHi: '3_Hach_hi',
  hachCold: '3_Hach_cold',

  // Usagi
  usagi: '4_Usagi',

  // Momonga
  momonga: '7_Momonga',
};

let cachedGuild: Guild | null = null;

async function getGuild(client?: Client): Promise<Guild | null> {
  if (cachedGuild) return cachedGuild;

  const ctx = getBotContext();
  const resolvedClient = client ?? null;
  if (!resolvedClient) return null;

  try {
    cachedGuild = await resolvedClient.guilds.fetch(ctx.env.NYARU_GUILD_ID);
    return cachedGuild;
  } catch {
    return null;
  }
}

/**
 * Get a server emoji string by its alias or exact name.
 * Returns the Discord emoji format `<:name:id>` or `<a:name:id>` for animated.
 * Falls back to the provided fallback emoji (default unicode emoji) if not found.
 */
export function getServerEmoji(client: Client, alias: string, fallback = ''): string {
  const emojiName = EMOJI_ALIASES[alias] ?? alias;
  const guild = client.guilds.cache.get(getBotContext().env.NYARU_GUILD_ID);
  if (!guild) return fallback;

  const emoji = guild.emojis.cache.find(e => e.name === emojiName);
  if (!emoji) return fallback;

  return emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
}

/**
 * Batch-resolve multiple emoji aliases. Returns a map of alias → emoji string.
 */
export function getServerEmojis(
  client: Client,
  aliases: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, fallback] of Object.entries(aliases)) {
    result[key] = getServerEmoji(client, key, fallback);
  }
  return result;
}

/**
 * Get emoji data for use in select menu options / button emojis.
 * Returns `{ id, name, animated }` for server emojis, or `{ name }` for unicode fallback.
 */
export function getEmojiOption(client: Client, alias: string, fallback = '⭐'): { id?: string; name: string; animated?: boolean } {
  const emojiName = EMOJI_ALIASES[alias] ?? alias;
  const guild = client.guilds.cache.get(getBotContext().env.NYARU_GUILD_ID);
  if (!guild) return { name: fallback };

  const emoji = guild.emojis.cache.find(e => e.name === emojiName);
  if (!emoji || !emoji.id || !emoji.name) return { name: fallback };

  return { id: emoji.id, name: emoji.name, animated: emoji.animated ?? false };
}

export { getGuild, EMOJI_ALIASES };
