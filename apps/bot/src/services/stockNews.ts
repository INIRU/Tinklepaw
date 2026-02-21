import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { EmbedBuilder, type Client } from 'discord.js';

import { getBotContext } from '../context.js';
import { getAppConfig, invalidateAppConfigCache, type AppConfig } from './config.js';

type RpcResult<T> = Promise<{ data: T[] | null; error: { message: string } | null }>;

type DynamicSupabase = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => {
    select: (columns: string) => {
      order: (column: string, options?: { ascending?: boolean }) => {
        limit: (count: number) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };
};

type SendableChannel = {
  send: (payload: { embeds: EmbedBuilder[] }) => Promise<unknown>;
};

type StockDashboardRpcRow = {
  symbol?: string;
  display_name?: string;
  price?: number;
  change_pct?: number;
  candles?: unknown;
  out_symbol?: string;
  out_display_name?: string;
  out_price?: number;
  out_change_pct?: number;
  out_candles?: unknown;
};

type ApplyStockNewsRpcRow = {
  out_event_id: number;
  out_price_before: number;
  out_price_after: number;
  out_signed_impact_bps: number;
  out_bucket_start: string;
};

type Sentiment = 'bullish' | 'bearish' | 'neutral';
type NewsTier = 'general' | 'rare' | 'shock';
type NewsReliability = 'rumor' | 'mixed' | 'confirmed';

type NewsTierProfile = {
  key: NewsTier;
  label: string;
  emoji: string;
  weight: number;
  minRatio: number;
  maxRatio: number;
};

type StockNewsDraft = {
  sentiment: Sentiment;
  tier: NewsTier;
  impactBpsAbs: number;
  headline: string;
  body: string;
};

type ScenarioSeeds = {
  bullish: string[];
  bearish: string[];
};

type RecentNewsPromptRow = {
  createdAt: string;
  sentiment: Sentiment;
  impactBps: number;
  headline: string;
  body: string;
  metadata: Record<string, unknown>;
};

type StoryChainState = {
  chainId: string;
  step: number;
  total: number;
  theme: string | null;
};

type NewsFlavorPlan = {
  sentiment: Sentiment;
  reversalCard: boolean;
  reversalFrom: Sentiment | null;
  reversalReason: string | null;
  chain: StoryChainState | null;
  chainContinuing: boolean;
  chainPhase: 'start' | 'middle' | 'final' | null;
  chainTag: string | null;
};

type NewsReliabilityProfile = {
  key: NewsReliability;
  label: string;
  emoji: string;
  multiplier: number;
};

type RecentSentimentStats = {
  bullish: number;
  bearish: number;
  neutral: number;
  lastSentiment: Sentiment | null;
  streak: number;
};

type RecentNewsContext = {
  lines: string;
  sentimentSummary: string;
  stats: RecentSentimentStats;
  rows: RecentNewsPromptRow[];
};

type ForcedNewsOverrides = {
  sentiment: Sentiment | null;
  tier: NewsTier | null;
  scenario: string | null;
  hasAny: boolean;
};

const STOCK_NEWS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    sentiment: {
      type: Type.STRING,
      description: 'One of bullish, bearish, neutral'
    },
    impact_bps: {
      type: Type.INTEGER,
      description: 'Absolute basis points impact, integer'
    },
    headline: {
      type: Type.STRING,
      description: 'Korean headline under 42 chars'
    },
    body: {
      type: Type.STRING,
      description: 'Korean body text, 2-3 short sentences'
    }
  },
  required: ['sentiment', 'impact_bps', 'headline', 'body']
};

const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 1440;
const MIN_IMPACT_BPS = 0;
const MAX_IMPACT_BPS = 5000;
const DEFAULT_STOCK_SYMBOL = 'KURO';
const DEFAULT_STOCK_DISPLAY_NAME = '쿠로 전자';
const SENTIMENT_BULLISH_PROBABILITY = 0.44;
const SENTIMENT_BEARISH_PROBABILITY = 0.44;
const RECENT_NEWS_PROMPT_COUNT = 5;
const RECENT_NEWS_BODY_SNIPPET_MAX = 88;
const FORCED_SCENARIO_MAX = 120;
const STORY_START_CHANCE = 0.62;
const STORY_CONTINUE_CHANCE = 0.78;
const STORY_CONTINUE_WINDOW_MS = 6 * 60 * 60 * 1000;
const STORY_MIN_STEPS = 2;
const STORY_MAX_STEPS = 4;
const REVERSAL_CARD_CHANCE = 0.14;

const NEWS_TIER_PROFILES: readonly NewsTierProfile[] = [
  { key: 'general', label: '일반', emoji: '📰', weight: 0.68, minRatio: 0.0, maxRatio: 0.44 },
  { key: 'rare', label: '희귀', emoji: '✨', weight: 0.24, minRatio: 0.45, maxRatio: 0.78 },
  { key: 'shock', label: '충격', emoji: '🚨', weight: 0.08, minRatio: 0.79, maxRatio: 1.0 }
];

const NEWS_TIER_META: Record<NewsTier, { label: string; emoji: string }> = {
  general: { label: '일반', emoji: '📰' },
  rare: { label: '희귀', emoji: '✨' },
  shock: { label: '충격', emoji: '🚨' }
};

const NEWS_RELIABILITY_PROFILES: readonly NewsReliabilityProfile[] = [
  { key: 'rumor', label: '루머', emoji: '🕸️', multiplier: 0.58 },
  { key: 'mixed', label: '혼재', emoji: '🧩', multiplier: 0.82 },
  { key: 'confirmed', label: '확정', emoji: '✅', multiplier: 1.0 },
];

const DEFAULT_BULLISH_REASON_SEEDS = [
  '차세대 제품 쇼케이스 기대감 확산',
  '대형 파트너십 체결 루머 확산',
  '핵심 엔지니어 팀 합류 소식',
  '기관성 매수세 유입 추정',
  '해외 커뮤니티에서 기술력 재평가'
];

const DEFAULT_BEARISH_REASON_SEEDS = [
  '생산 라인 점검 이슈 부각',
  '핵심 부품 수급 지연 우려 확대',
  '경영진 발언 해석 논란 확산',
  '단기 차익 실현 물량 집중',
  '경쟁사 공세 심화 관측'
];

const NEUTRAL_REASON_SEEDS = [
  '대형 재료 부재로 관망세 확대',
  '매수·매도 공방 속 방향성 탐색',
  '다음 이벤트 대기 심리 확산',
  '거래량 정체로 박스권 유지',
  '수급 균형 구간 진입'
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const pickOne = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

const toNumber = (value: unknown, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const parseMaybeDate = (value: string | null | undefined) => {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
};

const normalizeScenarioSeedList = (input: string[] | null | undefined, fallback: readonly string[]): string[] => {
  const normalized = Array.isArray(input)
    ? input.map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];
  return normalized.length > 0 ? normalized : [...fallback];
};

const resolveScenarioSeeds = (cfg: AppConfig): ScenarioSeeds => ({
  bullish: normalizeScenarioSeedList(cfg.stock_news_bullish_scenarios, DEFAULT_BULLISH_REASON_SEEDS),
  bearish: normalizeScenarioSeedList(cfg.stock_news_bearish_scenarios, DEFAULT_BEARISH_REASON_SEEDS)
});

const pickNewsTier = (): NewsTierProfile => {
  const roll = Math.random();
  let acc = 0;
  for (const profile of NEWS_TIER_PROFILES) {
    acc += profile.weight;
    if (roll < acc) return profile;
  }
  return NEWS_TIER_PROFILES[NEWS_TIER_PROFILES.length - 1]!;
};

const getTierImpactBounds = (profile: NewsTierProfile, minImpactBps: number, maxImpactBps: number) => {
  const spread = Math.max(0, maxImpactBps - minImpactBps);
  const lower = clamp(minImpactBps + Math.floor(spread * profile.minRatio), minImpactBps, maxImpactBps);
  const upper = clamp(minImpactBps + Math.floor(spread * profile.maxRatio), lower, maxImpactBps);
  return { lower, upper };
};

const pickTierImpact = (profile: NewsTierProfile, minImpactBps: number, maxImpactBps: number) => {
  const { lower, upper } = getTierImpactBounds(profile, minImpactBps, maxImpactBps);
  const range = Math.max(0, upper - lower);
  return lower + Math.floor(Math.random() * (range + 1));
};

const pickRandomSentiment = (): Sentiment => {
  const roll = Math.random();
  if (roll < SENTIMENT_BULLISH_PROBABILITY) return 'bullish';
  if (roll < SENTIMENT_BULLISH_PROBABILITY + SENTIMENT_BEARISH_PROBABILITY) return 'bearish';
  return 'neutral';
};

const pickReasonSeed = (sentiment: Sentiment, scenarioSeeds: ScenarioSeeds): string => {
  if (sentiment === 'bullish') return pickOne(scenarioSeeds.bullish);
  if (sentiment === 'bearish') return pickOne(scenarioSeeds.bearish);
  return pickOne(NEUTRAL_REASON_SEEDS);
};

const buildGameHeadline = (displayName: string, reasonSeed: string) => `${displayName} ${reasonSeed}`;

const buildGameBody = (displayName: string, sentiment: Sentiment, reasonSeed: string) => {
  if (sentiment === 'bullish') {
    return `${displayName} 관련해서 ${reasonSeed} 이슈가 돌면서 매수 심리가 빠르게 강해지고 있습니다. 단기 과열 구간일 수 있어 분할 대응이 권장됩니다.`;
  }
  if (sentiment === 'bearish') {
    return `${displayName} 관련해서 ${reasonSeed} 이슈가 확산되며 매도 압력이 커지고 있습니다. 변동성이 큰 구간이라 급격한 추격 매매는 주의가 필요합니다.`;
  }
  return `${displayName} 시장에서는 ${reasonSeed} 분위기 속에 매수·매도 공방이 이어지고 있습니다. 방향성 확정 전까지는 리스크 관리가 중요합니다.`;
};

const sanitizeGeneratedBody = (body: string) => {
  if (!body) return body;
  const hasExplicitNumbers = /\d[\d,.]*\s*(?:p|P|%|bps)/.test(body);
  const hasLowConfidenceWording = /(데이터\s*부족|초기\s*구간|방향성\s*판단|다소\s*어렵)/.test(body);
  if (!hasExplicitNumbers && !hasLowConfidenceWording) return body;
  return '수급 변화와 투자 심리 변동이 단기 흐름에 반영되고 있습니다. 변동성 구간에서는 분할 대응이 유리할 수 있습니다.';
};

const truncateText = (value: string, max: number) => {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
};

const normalizeSentiment = (value: unknown): Sentiment => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'bullish' || raw === 'bearish' || raw === 'neutral') return raw;
  return 'neutral';
};

const sentimentLabelForPrompt = (sentiment: Sentiment) => {
  if (sentiment === 'bullish') return '호재';
  if (sentiment === 'bearish') return '악재';
  return '중립';
};

const normalizeForcedSentiment = (value: unknown): Sentiment | null => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'bullish' || raw === 'bearish' || raw === 'neutral') return raw;
  return null;
};

const normalizeForcedTier = (value: unknown): NewsTier | null => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'general' || raw === 'rare' || raw === 'shock') return raw;
  return null;
};

const normalizeForcedScenario = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.slice(0, FORCED_SCENARIO_MAX);
};

const parseApiKeyList = (value: string | null | undefined) => {
  if (!value) return [];
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const resolveGeminiApiKeys = (env: {
  STOCK_NEWS_GEMINI_API_KEY?: string;
  STOCK_NEWS_GEMINI_API_KEY_FALLBACK?: string;
  STOCK_NEWS_GEMINI_API_KEYS?: string;
  GEMINI_API_KEY?: string;
  GEMINI_API_KEY_FALLBACK?: string;
  GEMINI_API_KEYS?: string;
}) => {
  const ordered = [
    env.STOCK_NEWS_GEMINI_API_KEY,
    env.STOCK_NEWS_GEMINI_API_KEY_FALLBACK,
    ...parseApiKeyList(env.STOCK_NEWS_GEMINI_API_KEYS),
    env.GEMINI_API_KEY,
    env.GEMINI_API_KEY_FALLBACK,
    ...parseApiKeyList(env.GEMINI_API_KEYS)
  ]
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry.length > 0);

  return [...new Set(ordered)];
};

const extractErrorText = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const shouldSwitchGeminiKey = (error: unknown) => {
  const text = extractErrorText(error).toLowerCase();
  return [
    'resource_exhausted',
    'quota',
    'rate limit',
    'too many requests',
    '429',
    'api key not valid',
    'invalid api key',
    'permission denied',
    'unauthenticated',
    '401',
    '403'
  ].some((token) => text.includes(token));
};

const getTierProfile = (tier: NewsTier | null): NewsTierProfile | null => {
  if (!tier) return null;
  return NEWS_TIER_PROFILES.find((profile) => profile.key === tier) ?? null;
};

const resolveForcedNewsOverrides = (cfg: AppConfig): ForcedNewsOverrides => {
  const sentiment = normalizeForcedSentiment(cfg.stock_news_force_sentiment);
  const tier = normalizeForcedTier(cfg.stock_news_force_tier);
  const scenario = normalizeForcedScenario(cfg.stock_news_force_scenario);
  return {
    sentiment,
    tier,
    scenario,
    hasAny: Boolean(sentiment || tier || scenario)
  };
};

const buildRecentSentimentStats = (rows: RecentNewsPromptRow[]): RecentSentimentStats => {
  const counts = rows.reduce(
    (acc, row) => {
      acc[row.sentiment] += 1;
      return acc;
    },
    { bullish: 0, bearish: 0, neutral: 0 }
  );

  if (rows.length === 0) {
    return {
      ...counts,
      lastSentiment: null,
      streak: 0
    };
  }

  const lastSentiment = rows[0]!.sentiment;
  let streak = 0;
  for (const row of rows) {
    if (row.sentiment !== lastSentiment) break;
    streak += 1;
  }

  return {
    ...counts,
    lastSentiment,
    streak
  };
};

const pickWeightedSentiment = (weights: { bullish: number; bearish: number; neutral: number }): Sentiment => {
  const bullish = Math.max(0.01, weights.bullish);
  const bearish = Math.max(0.01, weights.bearish);
  const neutral = Math.max(0.01, weights.neutral);
  const total = bullish + bearish + neutral;
  const roll = Math.random() * total;
  if (roll < bullish) return 'bullish';
  if (roll < bullish + bearish) return 'bearish';
  return 'neutral';
};

const decideCodeSentiment = (params: {
  forcedSentiment: Sentiment | null;
  changePct: number;
  dataIsSparse: boolean;
  recentStats: RecentSentimentStats;
}): Sentiment => {
  if (params.forcedSentiment) {
    return params.forcedSentiment;
  }

  const { changePct, dataIsSparse, recentStats } = params;
  const absChange = Math.abs(changePct);

  if (!dataIsSparse) {
    if (changePct >= 2.0) return 'bullish';
    if (changePct <= -2.0) return 'bearish';
  }

  const weights = {
    bullish: 0.33,
    bearish: 0.33,
    neutral: 0.34
  };

  if (changePct >= 0.8) {
    weights.bullish += 0.28;
    weights.bearish -= 0.16;
    weights.neutral -= 0.12;
  } else if (changePct <= -0.8) {
    weights.bearish += 0.28;
    weights.bullish -= 0.16;
    weights.neutral -= 0.12;
  } else if (absChange <= 0.35 || dataIsSparse) {
    weights.neutral += 0.26;
    weights.bullish -= 0.13;
    weights.bearish -= 0.13;
  }

  if (recentStats.bearish >= 4 && changePct > -1.8) {
    weights.neutral += 0.24;
    weights.bearish -= 0.20;
  }
  if (recentStats.bullish >= 4 && changePct < 1.8) {
    weights.neutral += 0.24;
    weights.bullish -= 0.20;
  }

  let picked = pickWeightedSentiment(weights);

  if (recentStats.lastSentiment && recentStats.streak >= 3 && picked === recentStats.lastSentiment && absChange < 2.4) {
    picked = 'neutral';
  }

  if (recentStats.lastSentiment === 'bearish' && recentStats.streak >= 4 && changePct > -2.2) {
    picked = changePct >= 0.4 ? 'bullish' : 'neutral';
  }
  if (recentStats.lastSentiment === 'bullish' && recentStats.streak >= 4 && changePct < 2.2) {
    picked = changePct <= -0.4 ? 'bearish' : 'neutral';
  }

  return picked;
};

const toObjectRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const parseStoryChainState = (metadata: Record<string, unknown>): StoryChainState | null => {
  const chainId = String(metadata.story_chain_id ?? '').trim();
  const step = Math.floor(toNumber(metadata.story_step, 0));
  const total = Math.floor(toNumber(metadata.story_total, 0));
  const themeRaw = String(metadata.story_theme ?? '').trim();
  if (!chainId || step <= 0 || total <= 0) return null;
  return {
    chainId,
    step,
    total,
    theme: themeRaw || null
  };
};

const pickReliabilityProfile = (tier: NewsTier): NewsReliabilityProfile => {
  const weights: Record<NewsReliability, number> =
    tier === 'shock'
      ? { rumor: 0.42, mixed: 0.38, confirmed: 0.20 }
      : tier === 'rare'
        ? { rumor: 0.32, mixed: 0.43, confirmed: 0.25 }
        : { rumor: 0.48, mixed: 0.34, confirmed: 0.18 };

  const roll = Math.random();
  const rumorCut = weights.rumor;
  const mixedCut = weights.rumor + weights.mixed;
  const picked: NewsReliability = roll < rumorCut ? 'rumor' : roll < mixedCut ? 'mixed' : 'confirmed';
  return NEWS_RELIABILITY_PROFILES.find((profile) => profile.key === picked) ?? NEWS_RELIABILITY_PROFILES[1]!;
};

const getOppositeSentiment = (sentiment: Sentiment): Sentiment => {
  if (sentiment === 'bullish') return 'bearish';
  if (sentiment === 'bearish') return 'bullish';
  return 'neutral';
};

const createStoryChainId = () => `arc_${Date.now().toString(36)}_${Math.floor(Math.random() * 1_000_000).toString(36)}`;

const resolveChainPhase = (chain: StoryChainState | null): NewsFlavorPlan['chainPhase'] => {
  if (!chain) return null;
  if (chain.step <= 1) return 'start';
  if (chain.step >= chain.total) return 'final';
  return 'middle';
};

const chainPhaseLabel = (phase: NewsFlavorPlan['chainPhase']) => {
  if (phase === 'start') return '연속 시작';
  if (phase === 'middle') return '연속 전개';
  if (phase === 'final') return '연속 결말';
  return null;
};

const buildChainTag = (chain: StoryChainState | null, phase: NewsFlavorPlan['chainPhase']) => {
  if (!chain || !phase) return null;
  const label = chainPhaseLabel(phase);
  if (!label) return null;
  return `${label} ${chain.step}/${chain.total}`;
};

const planNewsFlavor = (params: {
  recentRows: RecentNewsPromptRow[];
  baseSentiment: Sentiment;
  forcedSentiment: Sentiment | null;
  scenarioSeeds: ScenarioSeeds;
}): NewsFlavorPlan => {
  const latestRow = params.recentRows[0] ?? null;
  const latestMeta = toObjectRecord(latestRow?.metadata);
  const latestChain = parseStoryChainState(latestMeta);
  const latestAt = parseMaybeDate(latestRow?.createdAt);

  const canContinueChain = Boolean(
    latestChain
    && latestAt
    && latestChain.step < latestChain.total
    && (Date.now() - latestAt.getTime()) <= STORY_CONTINUE_WINDOW_MS
  );

  let chain: StoryChainState | null = null;
  let chainContinuing = false;

  const baseSentiment = params.forcedSentiment ?? params.baseSentiment;

  if (canContinueChain && Math.random() < STORY_CONTINUE_CHANCE) {
    chain = {
      chainId: latestChain!.chainId,
      step: latestChain!.step + 1,
      total: latestChain!.total,
      theme: latestChain!.theme,
    };
    chainContinuing = true;
  } else if (Math.random() < STORY_START_CHANCE) {
    const total = STORY_MIN_STEPS + Math.floor(Math.random() * (STORY_MAX_STEPS - STORY_MIN_STEPS + 1));
    chain = {
      chainId: createStoryChainId(),
      step: 1,
      total,
      theme: pickReasonSeed(baseSentiment, params.scenarioSeeds),
    };
  }

  const latestDirectional = params.recentRows.find((row) => row.sentiment !== 'neutral')?.sentiment ?? null;
  const chainPhasePre = resolveChainPhase(chain);
  const reversalChance = chainPhasePre === 'final' ? REVERSAL_CARD_CHANCE + 0.08 : REVERSAL_CARD_CHANCE;

  let sentiment = baseSentiment;
  let reversalCard = false;
  let reversalFrom: Sentiment | null = null;
  let reversalReason: string | null = null;

  if (!params.forcedSentiment && latestDirectional && Math.random() < reversalChance) {
    sentiment = getOppositeSentiment(latestDirectional);
    reversalCard = true;
    reversalFrom = latestDirectional;
    reversalReason = latestDirectional === 'bullish'
      ? '과열 심리 경계가 커지며 차익 실현이 급증'
      : '공포 완화와 저가 매수 유입이 동시 발생';
  } else if (chainContinuing && latestRow?.sentiment && latestRow.sentiment !== 'neutral' && !params.forcedSentiment) {
    sentiment = latestRow.sentiment;
  }

  if (!chain && reversalCard) {
    chain = {
      chainId: createStoryChainId(),
      step: 1,
      total: 2,
      theme: pickReasonSeed(sentiment, params.scenarioSeeds)
    };
  }

  if (chain && !chain.theme) {
    chain.theme = pickReasonSeed(sentiment, params.scenarioSeeds);
  }

  const chainPhase = resolveChainPhase(chain);
  const chainTag = buildChainTag(chain, chainPhase);

  return {
    sentiment,
    reversalCard,
    reversalFrom,
    reversalReason,
    chain,
    chainContinuing,
    chainPhase,
    chainTag,
  };
};

const applyFlavorToDraft = (draft: StockNewsDraft, flavor: NewsFlavorPlan): StockNewsDraft => {
  const tagParts: string[] = [];
  if (flavor.chainTag) tagParts.push(flavor.chainTag);
  if (flavor.reversalCard) tagParts.push('반전 카드');

  const headlineTag = tagParts.length > 0 ? `[${tagParts.join(' · ')}]` : null;
  const headline = headlineTag ? truncateText(`${headlineTag} ${draft.headline}`, 120) : draft.headline;

  const bodyHints: string[] = [];
  if (flavor.chain) {
    const phaseText = chainPhaseLabel(flavor.chainPhase);
    bodyHints.push(`${phaseText ?? '연속 스토리'} 단계(${flavor.chain.step}/${flavor.chain.total})로 후속 이슈가 이어집니다.`);
  }
  if (flavor.reversalCard && flavor.reversalReason) {
    bodyHints.push(`반전 카드 발동: ${flavor.reversalReason}.`);
  }

  const body = bodyHints.length > 0
    ? truncateText(`${draft.body} ${bodyHints.join(' ')}`.trim(), 800)
    : draft.body;

  return {
    ...draft,
    headline,
    body,
  };
};

const formatRecentNewsContext = (rows: RecentNewsPromptRow[]): string => {
  if (rows.length === 0) return '없음';
  return rows
    .map((row, index) => {
      const metadata = toObjectRecord(row.metadata);
      const chain = parseStoryChainState(metadata);
      const chainSuffix = chain ? ` | story ${Math.min(chain.step, chain.total)}/${chain.total}` : '';
      const reversalSuffix = Boolean(metadata.reversal_card_triggered) ? ' | 반전' : '';
      const created = parseMaybeDate(row.createdAt);
      const when = created
        ? created.toISOString().replace('T', ' ').slice(0, 16)
        : row.createdAt;
      const impact = row.impactBps >= 0 ? `+${row.impactBps}` : String(row.impactBps);
      const bodySnippet = truncateText(row.body.replace(/\s+/g, ' ').trim(), RECENT_NEWS_BODY_SNIPPET_MAX);
      return `${index + 1}) ${when} | ${sentimentLabelForPrompt(row.sentiment)} | ${impact}bps${chainSuffix}${reversalSuffix} | ${row.headline}\n- ${bodySnippet}`;
    })
    .join('\n');
};

const summarizeRecentNewsSentiment = (rows: RecentNewsPromptRow[]) => {
  const stats = buildRecentSentimentStats(rows);

  if (rows.length === 0) {
    return '최근 뉴스 감정 기록 없음';
  }

  const recentPattern = rows
    .slice(0, 4)
    .map((row) => sentimentLabelForPrompt(row.sentiment))
    .join(' -> ');

  const lastLabel = stats.lastSentiment ? sentimentLabelForPrompt(stats.lastSentiment) : '없음';
  return `최근 ${rows.length}건 분포: 호재 ${stats.bullish} / 악재 ${stats.bearish} / 중립 ${stats.neutral}; 직전 감정: ${lastLabel} ${stats.streak}연속; 최근 패턴: ${recentPattern}`;
};

const loadRecentNewsContext = async (dynamicSupabase: DynamicSupabase): Promise<RecentNewsContext> => {
  const { data, error } = await dynamicSupabase
    .from('stock_news_events')
    .select('created_at, sentiment, impact_bps, headline, body, metadata')
    .order('created_at', { ascending: false })
    .limit(RECENT_NEWS_PROMPT_COUNT);

  if (error) {
    console.warn('[StockNews] failed to load recent news context:', error.message);
    return {
      lines: '없음',
      sentimentSummary: '최근 뉴스 감정 기록 로드 실패',
      stats: {
        bullish: 0,
        bearish: 0,
        neutral: 0,
        lastSentiment: null,
        streak: 0
      },
      rows: []
    };
  }

  const rows = Array.isArray(data)
    ? data
      .map((row): RecentNewsPromptRow | null => {
        const createdAt = String(row.created_at ?? '').trim();
        const headline = String(row.headline ?? '').trim();
        const body = String(row.body ?? '').trim();
        if (!createdAt || !headline || !body) return null;
        return {
          createdAt,
          sentiment: normalizeSentiment(row.sentiment),
          impactBps: Math.trunc(toNumber(row.impact_bps, 0)),
          headline,
          body,
          metadata: toObjectRecord(row.metadata),
        };
      })
      .filter((row): row is RecentNewsPromptRow => row !== null)
    : [];

  return {
    lines: formatRecentNewsContext(rows),
    sentimentSummary: summarizeRecentNewsSentiment(rows),
    stats: buildRecentSentimentStats(rows),
    rows,
  };
};

const resolveStockTicker = (row: StockDashboardRpcRow | null | undefined) => {
  const symbolRaw = String(row?.out_symbol ?? row?.symbol ?? DEFAULT_STOCK_SYMBOL).trim();
  const displayNameRaw = String(row?.out_display_name ?? row?.display_name ?? DEFAULT_STOCK_DISPLAY_NAME).trim();

  return {
    symbol: symbolRaw || DEFAULT_STOCK_SYMBOL,
    displayName: displayNameRaw || DEFAULT_STOCK_DISPLAY_NAME
  };
};

const isSendableChannel = (value: unknown): value is SendableChannel => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { send?: unknown };
  return typeof candidate.send === 'function';
};

const pickDailySlotForDate = (baseDate: Date, startHourRaw: number, endHourRaw: number) => {
  const startHour = clamp(Math.floor(startHourRaw), 0, 23);
  const endHour = clamp(Math.floor(endHourRaw), 0, 23);

  const start = new Date(baseDate);
  start.setHours(startHour, 0, 0, 0);

  const end = new Date(baseDate);
  end.setHours(endHour, 59, 59, 999);

  if (end.getTime() < start.getTime()) end.setDate(end.getDate() + 1);

  const range = Math.max(1, end.getTime() - start.getTime() + 1);
  const offset = Math.floor(Math.random() * range);
  return new Date(start.getTime() + offset);
};

const getInitialDailyNextRun = (cfg: AppConfig, now: Date) => {
  const candidate = pickDailySlotForDate(now, cfg.stock_news_daily_window_start_hour, cfg.stock_news_daily_window_end_hour);
  if (candidate.getTime() > now.getTime() + 60_000) return candidate;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return pickDailySlotForDate(tomorrow, cfg.stock_news_daily_window_start_hour, cfg.stock_news_daily_window_end_hour);
};

const getNextRunAfterSend = (cfg: AppConfig, now: Date) => {
  if (cfg.stock_news_schedule_mode === 'daily_random') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return pickDailySlotForDate(tomorrow, cfg.stock_news_daily_window_start_hour, cfg.stock_news_daily_window_end_hour);
  }

  const intervalMinutes = clamp(
    Math.floor(toNumber(cfg.stock_news_interval_minutes, 60)),
    MIN_INTERVAL_MINUTES,
    MAX_INTERVAL_MINUTES
  );
  return new Date(now.getTime() + intervalMinutes * 60_000);
};

const buildFallbackDraft = (params: {
  minImpactBps: number;
  maxImpactBps: number;
  displayName: string;
  scenarioSeeds: ScenarioSeeds;
  forcedSentiment?: Sentiment | null;
  forcedTier?: NewsTier | null;
  forcedScenario?: string | null;
}): StockNewsDraft => {
  const { minImpactBps, maxImpactBps, displayName, scenarioSeeds, forcedSentiment, forcedTier, forcedScenario } = params;

  const sentiment = forcedSentiment ?? pickRandomSentiment();
  const tierProfile = getTierProfile(forcedTier ?? null) ?? pickNewsTier();
  const reasonSeed = forcedScenario ?? pickReasonSeed(sentiment, scenarioSeeds);
  const impactBpsAbs = pickTierImpact(tierProfile, minImpactBps, maxImpactBps);
  const headline = buildGameHeadline(displayName, reasonSeed);

  return {
    sentiment,
    tier: tierProfile.key,
    impactBpsAbs,
    headline,
    body: buildGameBody(displayName, sentiment, reasonSeed)
  };
};

const buildGeminiDraft = async (params: {
  apiKey: string;
  symbol: string;
  displayName: string;
  currentPrice: number;
  changePct: number;
  recentSummary: string;
  recentNewsContext: string;
  recentSentimentSummary: string;
  dataIsSparse: boolean;
  minImpactBps: number;
  maxImpactBps: number;
  scenarioSeeds: ScenarioSeeds;
  forcedSentiment: Sentiment;
  forcedTier?: NewsTier | null;
  forcedScenario?: string | null;
}): Promise<StockNewsDraft | null> => {
  const ai = new GoogleGenAI({ apiKey: params.apiKey });
  const forcedTierProfile = getTierProfile(params.forcedTier ?? null) ?? pickNewsTier();
  const forcedTier = forcedTierProfile.key;
  const tierBounds = getTierImpactBounds(forcedTierProfile, params.minImpactBps, params.maxImpactBps);
  const reasonSeed = params.forcedScenario ?? pickReasonSeed(params.forcedSentiment, params.scenarioSeeds);
  const forcedSentimentLabel = sentimentLabelForPrompt(params.forcedSentiment);

  const systemInstruction =
    `당신은 디스코드 주식 게임의 단일 종목 ${params.displayName}(${params.symbol}) 뉴스 에디터다. 반드시 JSON만 반환한다. 뉴스 이유는 현실 근거가 없어도 되고, 게임 이벤트처럼 그럴듯하게 작성한다.`;

  const prompt = [
    `디스코드 주식 게임 단일 종목 ${params.displayName}(${params.symbol}) 뉴스 1건을 작성해줘.`,
    `현재 가격: ${params.currentPrice.toFixed(0)}p`,
    `현재 등락률: ${params.changePct.toFixed(2)}%`,
    `최근 흐름 요약: ${params.recentSummary}`,
    `최근 감정 요약: ${params.recentSentimentSummary}`,
    `직전 뉴스 기록(최신순):\n${params.recentNewsContext}`,
    `캔들 데이터 상태: ${params.dataIsSparse ? '제한적' : '충분'}`,
    `이번 기사 감정은 반드시 \`${params.forcedSentiment}\`(${forcedSentimentLabel})로 고정해.`,
    `이번 기사 티어는 반드시 \`${forcedTier}\`(${forcedTierProfile.label})로 고정해.`,
    'sentiment 값은 위에서 지정한 고정값을 그대로 사용하고 임의 변경하지 마.',
    `이유 키워드 \`${reasonSeed}\`를 반드시 포함해.`,
    '최근 뉴스와 headline/핵심 이유가 과도하게 중복되지 않도록, 자연스러운 다음 전개처럼 작성.',
    'body에는 가격/등락률/bps 같은 정확한 숫자를 쓰지 말고, 방향성과 분위기만 서술형으로 작성.',
    '뉴스 이유는 실제 사실일 필요 없이, 게임 내에서 발생한 이슈처럼 자연스럽게 작성.',
    `impact_bps는 절대값 정수로 ${tierBounds.lower}~${tierBounds.upper} 범위만 사용.`,
    'headline은 42자 이하, body는 2~3문장으로 작성.'
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: STOCK_NEWS_SCHEMA,
      systemInstruction: { parts: [{ text: systemInstruction }] }
    }
  });

  if (!response.text) return null;

  try {
    const parsed = JSON.parse(response.text) as {
      sentiment?: unknown;
      impact_bps?: unknown;
      headline?: unknown;
      body?: unknown;
    };

    const sentiment = params.forcedSentiment;
    const parsedImpactBps = Math.abs(Math.floor(toNumber(parsed.impact_bps, tierBounds.lower)));
    const impactBpsAbs = clamp(parsedImpactBps, tierBounds.lower, tierBounds.upper);
    const headline = String(parsed.headline ?? '').trim() || buildGameHeadline(params.displayName, reasonSeed);
    const body = sanitizeGeneratedBody(String(parsed.body ?? '').trim()) || buildGameBody(params.displayName, sentiment, reasonSeed);
    if (!headline || !body) return null;

    return {
      sentiment,
      tier: forcedTier,
      impactBpsAbs,
      headline: headline.slice(0, 120),
      body: body.slice(0, 800)
    };
  } catch (error) {
    console.warn('[StockNews] Gemini parse failed:', error);
    return null;
  }
};

const getMarketSignal = (candlesRaw: unknown) => {
  if (!Array.isArray(candlesRaw) || candlesRaw.length < 2) {
    return {
      summary: '캔들 데이터 부족(초기 구간), 거래량 데이터 부족',
      dataIsSparse: true,
      candleCount: Array.isArray(candlesRaw) ? candlesRaw.length : 0
    };
  }

  const candleCount = candlesRaw.length;
  const dataIsSparse = candleCount < 12;
  const candles = candlesRaw.slice(-12) as Array<Record<string, unknown>>;
  const first = candles[0] ?? {};
  const last = candles[candles.length - 1] ?? {};
  const open = toNumber(first.o ?? first.open_price, 0);
  const close = toNumber(last.c ?? last.close_price, open);
  const maxHigh = candles.reduce((acc, row) => Math.max(acc, toNumber(row.h ?? row.high_price, acc)), open);
  const minLow = candles.reduce((acc, row) => Math.min(acc, toNumber(row.l ?? row.low_price, acc)), open || Infinity);
  const movePct = open > 0 ? ((close - open) / open) * 100 : 0;
  const volumes = candles
    .map((row) => toNumber(row.v ?? row.volume ?? row.volume_total ?? row.trade_volume, Number.NaN))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const latestVolume = volumes.length > 0 ? volumes[volumes.length - 1]! : null;
  const baselineVolumes = volumes.length > 1 ? volumes.slice(0, -1) : [];
  const baselineVolume = baselineVolumes.length > 0
    ? baselineVolumes.reduce((acc, value) => acc + value, 0) / baselineVolumes.length
    : null;
  const volumeRatio = latestVolume !== null && baselineVolume !== null && baselineVolume > 0
    ? latestVolume / baselineVolume
    : null;

  let volumeSummary = '거래량 데이터 부족';
  if (volumeRatio !== null) {
    if (volumeRatio >= 1.35) {
      volumeSummary = `거래량 급증(${volumeRatio.toFixed(2)}배)`;
    } else if (volumeRatio <= 0.7) {
      volumeSummary = `거래량 둔화(${volumeRatio.toFixed(2)}배)`;
    } else {
      volumeSummary = `거래량 보합(${volumeRatio.toFixed(2)}배)`;
    }
  }

  return {
    summary: `최근 12캔들 기준 ${movePct >= 0 ? '+' : ''}${movePct.toFixed(2)}%, 고가 ${maxHigh.toFixed(0)}p / 저가 ${minLow.toFixed(0)}p, ${volumeSummary}`,
    dataIsSparse,
    candleCount
  };
};

const shouldRunStockNews = (cfg: AppConfig, now: Date) => {
  const forcedAt = parseMaybeDate(cfg.stock_news_force_run_at);
  if (forcedAt && forcedAt.getTime() <= now.getTime()) {
    return { shouldRun: true, forced: true, nextRunAt: null as Date | null };
  }

  if (cfg.stock_news_schedule_mode === 'daily_random') {
    const nextRunAt = parseMaybeDate(cfg.stock_news_next_run_at) ?? getInitialDailyNextRun(cfg, now);
    return {
      shouldRun: now.getTime() >= nextRunAt.getTime(),
      forced: false,
      nextRunAt
    };
  }

  const intervalMinutes = clamp(
    Math.floor(toNumber(cfg.stock_news_interval_minutes, 60)),
    MIN_INTERVAL_MINUTES,
    MAX_INTERVAL_MINUTES
  );
  const intervalMs = intervalMinutes * 60_000;
  const lastSentAt = parseMaybeDate(cfg.stock_news_last_sent_at);
  const dueAt = lastSentAt ? new Date(lastSentAt.getTime() + intervalMs) : now;
  return {
    shouldRun: now.getTime() >= dueAt.getTime(),
    forced: false,
    nextRunAt: dueAt
  };
};

const sendNewsMessage = async (client: Client, params: {
  channelId: string;
  symbol: string;
  displayName: string;
  draft: StockNewsDraft;
  applied: ApplyStockNewsRpcRow;
  marketPrice: number;
  marketChangePct: number;
  forced: boolean;
  flavor: NewsFlavorPlan;
  reliability: NewsReliabilityProfile;
  adjustedImpactBps: number;
}) => {
  const channel = await client.channels.fetch(params.channelId).catch(() => null);
  if (!isSendableChannel(channel)) {
    throw new Error('Configured stock news channel is not available');
  }

  const signed = params.applied.out_signed_impact_bps;
  const impactPct = signed / 100;
  const impactLabel = `${impactPct >= 0 ? '+' : ''}${impactPct.toFixed(2)}%`;
  const directionLabel = signed > 0 ? '매수 우위' : signed < 0 ? '매도 우위' : '중립';
  const color = signed > 0 ? 0x2ecc71 : signed < 0 ? 0xe74c3c : 0x95a5a6;
  const sentimentLabel = params.draft.sentiment === 'bullish' ? '호재' : params.draft.sentiment === 'bearish' ? '악재' : '중립';
  const sentimentEmoji = params.draft.sentiment === 'bullish' ? '🟢' : params.draft.sentiment === 'bearish' ? '🔴' : '🟡';
  const tierMeta = NEWS_TIER_META[params.draft.tier];
  const moveEmoji = signed > 0 ? '📈' : signed < 0 ? '📉' : '➖';
  const priceDelta = params.applied.out_price_after - params.applied.out_price_before;
  const signalNote = priceDelta === 0
    ? '직접 가격 조정 없이 자동매매 편향만 반영'
    : `즉시 가격 반영 ${priceDelta >= 0 ? '+' : ''}${priceDelta.toLocaleString()}p`;
  const storyLabel = params.flavor.chain
    ? `${params.flavor.chainTag ?? '연속 스토리'} · 테마 ${params.flavor.chain.theme ?? '시장 이슈'}`
    : '단발 뉴스 이벤트';
  const reversalLabel = params.flavor.reversalCard
    ? `발동 (${params.flavor.reversalFrom === 'bullish' ? '호재 -> 악재' : '악재 -> 호재'})`
    : '없음';
  const adjustedImpactPct = (params.adjustedImpactBps / 100).toFixed(2);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📰 ${params.displayName} 뉴스`)
    .setDescription(
      [
        `> **${params.draft.headline}**`,
        '',
        `- ${sentimentEmoji} **분류:** **${sentimentLabel}**`,
        `- ${tierMeta.emoji} **티어:** **${tierMeta.label}**`,
        `- ${params.reliability.emoji} **신뢰도:** **${params.reliability.label}**`,
        `- ${moveEmoji} **영향:** \`${directionLabel} ${impactLabel}\``,
        `- 🏷️ **종목:** **${params.displayName} (${params.symbol})**`,
        '',
        '**브리핑**',
        params.draft.body
      ].join('\n')
    )
    .addFields(
      {
        name: '🧠 자동매매 신호',
        value: `편향 \`${directionLabel}\`\n강도 \`${impactLabel}\` (조정치 ${adjustedImpactPct}%)\n${signalNote}`,
        inline: false
      },
      {
        name: '📚 스토리',
        value: `${storyLabel}\n반전 카드: ${reversalLabel}`,
        inline: false
      },
      {
        name: '📍 현재 시세',
        value: `**${params.marketPrice.toLocaleString()}p** (${params.marketChangePct >= 0 ? '+' : ''}${params.marketChangePct.toFixed(2)}%)`,
        inline: true
      },
      {
        name: '🧠 신호',
        value: `${sentimentEmoji} ${sentimentLabel} / ${tierMeta.emoji} ${tierMeta.label} / ${moveEmoji} ${directionLabel} ${impactLabel}`,
        inline: true
      },
      {
        name: '📐 해석',
        value: `신뢰도(${params.reliability.label})에 따라 편향 강도가 보정됩니다.`,
        inline: true
      }
    )
    .setFooter({ text: `${params.symbol} Market Feed` })
    .setTimestamp(new Date());

  await channel.send({ embeds: [embed] });
};

export async function runStockNewsCycle(client: Client): Promise<void> {
  const cfg = await getAppConfig();
  if (!cfg.stock_news_enabled || !cfg.stock_news_channel_id) return;
  const scenarioSeeds = resolveScenarioSeeds(cfg);

  const now = new Date();
  const decision = shouldRunStockNews(cfg, now);

  if (!decision.shouldRun) {
    const stored = parseMaybeDate(cfg.stock_news_next_run_at);
    if (decision.nextRunAt && (!stored || stored.getTime() !== decision.nextRunAt.getTime())) {
      const ctx = getBotContext();
      const dynamicSupabase = ctx.supabase as unknown as DynamicSupabase;
      const { error } = await dynamicSupabase
        .from('app_config')
        .update({ stock_news_next_run_at: decision.nextRunAt.toISOString() })
        .eq('id', 1);
      if (error) {
        console.warn('[StockNews] failed to persist next run time:', error.message);
      }
      invalidateAppConfigCache();
    }
    return;
  }

  const ctx = getBotContext();
  const dynamicSupabase = ctx.supabase as unknown as DynamicSupabase;
  const rpc = ctx.supabase.rpc.bind(ctx.supabase) as unknown as <T>(
    fn: string,
    args?: Record<string, unknown>
  ) => RpcResult<T>;

  const { data: dashboardRows, error: dashboardError } = await rpc<StockDashboardRpcRow>('get_stock_dashboard', {
    p_discord_user_id: '__stock_news_worker__'
  });
  if (dashboardError) {
    throw new Error(`[StockNews] get_stock_dashboard failed: ${dashboardError.message}`);
  }

  const dashboard = Array.isArray(dashboardRows) ? dashboardRows[0] : null;
  if (!dashboard) throw new Error('[StockNews] dashboard payload missing');
  const stockTicker = resolveStockTicker(dashboard);

  const bullishMinImpactBps = clamp(
    Math.floor(toNumber(cfg.stock_news_bullish_min_impact_bps, 40)),
    MIN_IMPACT_BPS,
    MAX_IMPACT_BPS,
  );
  const bullishMaxImpactBps = clamp(
    Math.floor(toNumber(cfg.stock_news_bullish_max_impact_bps, 260)),
    bullishMinImpactBps,
    MAX_IMPACT_BPS,
  );
  const bearishMinImpactBps = clamp(
    Math.floor(toNumber(cfg.stock_news_bearish_min_impact_bps, 40)),
    MIN_IMPACT_BPS,
    MAX_IMPACT_BPS,
  );
  const bearishMaxImpactBps = clamp(
    Math.floor(toNumber(cfg.stock_news_bearish_max_impact_bps, 260)),
    bearishMinImpactBps,
    MAX_IMPACT_BPS,
  );
  const currentPrice = Math.max(50, toNumber(dashboard.out_price ?? dashboard.price, 0));
  const changePct = toNumber(dashboard.out_change_pct ?? dashboard.change_pct, 0);
  const marketSignal = getMarketSignal(dashboard.out_candles ?? dashboard.candles);
  const recentNewsContext = await loadRecentNewsContext(dynamicSupabase);
  const forcedOverrides = resolveForcedNewsOverrides(cfg);
  const baseSentiment = decideCodeSentiment({
    forcedSentiment: forcedOverrides.sentiment,
    changePct,
    dataIsSparse: marketSignal.dataIsSparse,
    recentStats: recentNewsContext.stats
  });
  const flavorPlan = planNewsFlavor({
    recentRows: recentNewsContext.rows,
    baseSentiment,
    forcedSentiment: forcedOverrides.sentiment,
    scenarioSeeds,
  });
  const selectedSentiment = flavorPlan.sentiment;
  const selectedImpactBounds = selectedSentiment === 'bearish'
    ? { minImpactBps: bearishMinImpactBps, maxImpactBps: bearishMaxImpactBps }
    : { minImpactBps: bullishMinImpactBps, maxImpactBps: bullishMaxImpactBps };
  const storyScenarioHint = forcedOverrides.scenario ?? flavorPlan.chain?.theme ?? null;

  const apiKeys = resolveGeminiApiKeys(ctx.env);
  if (apiKeys.length === 0) {
    console.warn('[StockNews] Gemini API key missing; skipping cycle (sentiment is model-owned).');
    return;
  }

  let draft: StockNewsDraft | null = null;
  let usedKeyOrdinal: number | null = null;
  for (let index = 0; index < apiKeys.length; index += 1) {
    const apiKey = apiKeys[index]!;
    try {
      const candidate = await buildGeminiDraft({
        apiKey,
        symbol: stockTicker.symbol,
        displayName: stockTicker.displayName,
        currentPrice,
        changePct,
        recentSummary: marketSignal.summary,
        recentNewsContext: recentNewsContext.lines,
        recentSentimentSummary: recentNewsContext.sentimentSummary,
        dataIsSparse: marketSignal.dataIsSparse,
        minImpactBps: selectedImpactBounds.minImpactBps,
        maxImpactBps: selectedImpactBounds.maxImpactBps,
        scenarioSeeds,
        forcedSentiment: selectedSentiment,
        forcedTier: forcedOverrides.tier,
        forcedScenario: storyScenarioHint
      });

      if (candidate) {
        draft = candidate;
        usedKeyOrdinal = index + 1;
        break;
      }

      const hasNextKey = index + 1 < apiKeys.length;
      console.warn(
        `[StockNews] Gemini draft empty on key #${index + 1}${hasNextKey ? `; trying backup key #${index + 2}.` : '.'}`
      );
      continue;
    } catch (error) {
      const hasNextKey = index + 1 < apiKeys.length;
      if (hasNextKey && shouldSwitchGeminiKey(error)) {
        console.warn(`[StockNews] Gemini key #${index + 1} exhausted/unavailable; switching to backup key #${index + 2}.`);
        continue;
      }

      console.warn(`[StockNews] Gemini request failed on key #${index + 1}:`, error);
      if (hasNextKey) {
        console.warn(`[StockNews] trying backup key #${index + 2} after request failure.`);
        continue;
      }
    }
  }

  if (!draft) {
    console.warn('[StockNews] Gemini draft generation failed on all keys; skipping cycle without fallback.');
    return;
  }

  const reliability = pickReliabilityProfile(draft.tier);
  const flavoredDraft = applyFlavorToDraft(draft, flavorPlan);
  let adjustedImpactBps = Math.round(flavoredDraft.impactBpsAbs * reliability.multiplier);
  if (flavorPlan.reversalCard) {
    adjustedImpactBps = Math.round(adjustedImpactBps * 1.12);
  }
  if (flavorPlan.chain && flavorPlan.chain.step >= flavorPlan.chain.total) {
    adjustedImpactBps = Math.round(adjustedImpactBps * 1.08);
  }
  adjustedImpactBps = clamp(adjustedImpactBps, selectedImpactBounds.minImpactBps, selectedImpactBounds.maxImpactBps);

  const { data: applyRows, error: applyError } = await rpc<ApplyStockNewsRpcRow>('apply_stock_news_impact', {
    p_sentiment: flavoredDraft.sentiment,
    p_impact_bps: adjustedImpactBps,
    p_headline: flavoredDraft.headline,
    p_body: flavoredDraft.body,
    p_source: 'gemini',
    p_channel_id: cfg.stock_news_channel_id,
    p_metadata: {
      trigger: decision.forced ? 'manual' : 'schedule',
      model: 'gemini-2.5-flash-lite',
      tier: flavoredDraft.tier,
      reliability_key: reliability.key,
      reliability_label: reliability.label,
      reliability_multiplier: reliability.multiplier,
      raw_impact_bps: flavoredDraft.impactBpsAbs,
      adjusted_impact_bps: adjustedImpactBps,
      data_is_sparse: marketSignal.dataIsSparse,
      candle_count: marketSignal.candleCount,
      forced_sentiment: forcedOverrides.sentiment,
      base_sentiment: baseSentiment,
      selected_sentiment: selectedSentiment,
      forced_tier: forcedOverrides.tier,
      forced_scenario: storyScenarioHint,
      story_chain_id: flavorPlan.chain?.chainId ?? null,
      story_step: flavorPlan.chain?.step ?? null,
      story_total: flavorPlan.chain?.total ?? null,
      story_theme: flavorPlan.chain?.theme ?? null,
      story_continuing: flavorPlan.chainContinuing,
      story_phase: flavorPlan.chainPhase,
      story_tag: flavorPlan.chainTag,
      reversal_card_triggered: flavorPlan.reversalCard,
      reversal_from_sentiment: flavorPlan.reversalFrom,
      reversal_reason: flavorPlan.reversalReason,
      impact_bounds_direction: selectedSentiment === 'bearish' ? 'bearish' : 'bullish_or_neutral',
      impact_bounds_min_bps: selectedImpactBounds.minImpactBps,
      impact_bounds_max_bps: selectedImpactBounds.maxImpactBps,
      manipulated: forcedOverrides.hasAny,
      gemini_key_ordinal: usedKeyOrdinal,
      generated_at: now.toISOString()
    }
  });

  if (applyError) {
    throw new Error(`[StockNews] apply_stock_news_impact failed: ${applyError.message}`);
  }

  const applied = Array.isArray(applyRows) ? applyRows[0] : null;
  if (!applied) throw new Error('[StockNews] apply_stock_news_impact returned empty payload');

  const { data: postDashboardRows, error: postDashboardError } = await rpc<StockDashboardRpcRow>('get_stock_dashboard', {
    p_discord_user_id: '__stock_news_worker__'
  });
  if (postDashboardError) {
    console.warn('[StockNews] post-impact dashboard fetch failed:', postDashboardError.message);
  }
  const postDashboard = Array.isArray(postDashboardRows) ? postDashboardRows[0] : null;
  const postTicker = resolveStockTicker(postDashboard ?? dashboard);
  const marketPrice = Math.max(
    50,
    toNumber(postDashboard?.out_price ?? postDashboard?.price, applied.out_price_after)
  );
  const marketChangePct = toNumber(postDashboard?.out_change_pct ?? postDashboard?.change_pct, changePct);

  await sendNewsMessage(client, {
    channelId: cfg.stock_news_channel_id,
    symbol: postTicker.symbol,
    displayName: postTicker.displayName,
    draft: flavoredDraft,
    applied,
    marketPrice,
    marketChangePct,
    forced: decision.forced,
    flavor: flavorPlan,
    reliability,
    adjustedImpactBps,
  });

  const nextRunAt = getNextRunAfterSend(cfg, now);
  const { error: scheduleUpdateError } = await dynamicSupabase
    .from('app_config')
    .update({
      stock_news_last_sent_at: now.toISOString(),
      stock_news_next_run_at: nextRunAt.toISOString(),
      stock_news_force_run_at: null,
      stock_news_force_sentiment: null,
      stock_news_force_tier: null,
      stock_news_force_scenario: null
    })
    .eq('id', 1);
  if (scheduleUpdateError) {
    throw new Error(`[StockNews] failed to update schedule metadata: ${scheduleUpdateError.message}`);
  }
  invalidateAppConfigCache();
}
