import type { Kazagumo } from 'kazagumo';

type SearchResult = Awaited<ReturnType<Kazagumo['search']>>;

type SearchRequester = {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  source?: string;
};

type OEmbedPayload = {
  title?: unknown;
  author_name?: unknown;
};

const YOUTUBE_OEMBED_ENDPOINT = 'https://www.youtube.com/oembed';
const OEMBED_TIMEOUT_MS = 4000;

export const normalizeMusicQuery = (raw: string) => {
  const trimmed = raw.trim().replace(/^<(.+)>$/, '$1').trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^spotify:/i.test(trimmed)) {
    const parts = trimmed.split(':');
    if (parts.length >= 3) return `https://open.spotify.com/${parts[1]}/${parts[2]}`;
  }
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
};

export const isSpotifyQuery = (value: string) => /spotify\.com/i.test(value) || /^spotify:/i.test(value);

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const isYouTubeUrl = (value: string) => {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host.includes('youtube.com') || host.includes('youtu.be');
  } catch {
    return false;
  }
};

const compactTitle = (title: string) =>
  title
    .replace(/\[(official|lyrics?|lyric video|mv|audio|music video)\]/gi, '')
    .replace(/\((official|lyrics?|lyric video|mv|audio|music video)\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

const fetchYouTubeOEmbed = async (url: string) => {
  if (!isYouTubeUrl(url)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);

  try {
    const endpoint = `${YOUTUBE_OEMBED_ENDPOINT}?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(endpoint, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'NyaruBot/1.0'
      }
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as OEmbedPayload;
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    const author = typeof payload.author_name === 'string' ? payload.author_name.trim() : '';

    if (!title) return null;
    return { title, author };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const buildFallbackQueries = (metadata: { title: string; author: string } | null) => {
  if (!metadata) return [];

  const candidates = new Set<string>();
  const cleanTitle = compactTitle(metadata.title);

  if (metadata.title && metadata.author) candidates.add(`${metadata.title} ${metadata.author}`.trim());
  if (metadata.title) candidates.add(metadata.title);
  if (cleanTitle && cleanTitle !== metadata.title) {
    if (metadata.author) candidates.add(`${cleanTitle} ${metadata.author}`.trim());
    candidates.add(cleanTitle);
  }

  return Array.from(candidates).filter((query) => query.length > 0);
};

export type SearchWithFallback = {
  query: string;
  result: SearchResult;
  fallbackUsed: boolean;
  fallbackQuery: string | null;
};

export const searchTracksWithFallback = async (
  music: Kazagumo,
  rawQuery: string,
  requester: SearchRequester,
): Promise<SearchWithFallback> => {
  const query = normalizeMusicQuery(rawQuery);
  const primaryResult = await music.search(query, { requester });

  if (primaryResult.tracks.length > 0 || !isHttpUrl(query)) {
    return {
      query,
      result: primaryResult,
      fallbackUsed: false,
      fallbackQuery: null,
    };
  }

  const metadata = await fetchYouTubeOEmbed(query);
  const candidates = buildFallbackQueries(metadata);

  for (const fallbackQuery of candidates) {
    if (fallbackQuery === query) continue;
    const fallbackResult = await music.search(fallbackQuery, { requester });
    if (fallbackResult.tracks.length > 0) {
      return {
        query,
        result: fallbackResult,
        fallbackUsed: true,
        fallbackQuery,
      };
    }
  }

  return {
    query,
    result: primaryResult,
    fallbackUsed: false,
    fallbackQuery: null,
  };
};
