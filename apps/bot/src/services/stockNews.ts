import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { EmbedBuilder, type Client } from 'discord.js';

import { getBotContext } from '../context.js';
import { getAppConfig, invalidateAppConfigCache, type AppConfig } from './config.js';

type RpcResult<T> = Promise<{ data: T[] | null; error: { message: string } | null }>;

type DynamicSupabase = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => {
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
}): StockNewsDraft => {
  const { minImpactBps, maxImpactBps, displayName, scenarioSeeds } = params;

  const sentiment = pickRandomSentiment();
  const tierProfile = pickNewsTier();
  const reasonSeed = pickReasonSeed(sentiment, scenarioSeeds);
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
  dataIsSparse: boolean;
  minImpactBps: number;
  maxImpactBps: number;
  scenarioSeeds: ScenarioSeeds;
}): Promise<StockNewsDraft | null> => {
  const ai = new GoogleGenAI({ apiKey: params.apiKey });
  const forcedSentiment = pickRandomSentiment();
  const forcedTierProfile = pickNewsTier();
  const forcedTier = forcedTierProfile.key;
  const tierBounds = getTierImpactBounds(forcedTierProfile, params.minImpactBps, params.maxImpactBps);
  const reasonSeed = pickReasonSeed(forcedSentiment, params.scenarioSeeds);
  const forcedSentimentLabel = forcedSentiment === 'bullish' ? '호재' : forcedSentiment === 'bearish' ? '악재' : '중립';

  const systemInstruction =
    `당신은 디스코드 주식 게임의 단일 종목 ${params.displayName}(${params.symbol}) 뉴스 에디터다. 반드시 JSON만 반환한다. 뉴스 이유는 현실 근거가 없어도 되고, 게임 이벤트처럼 그럴듯하게 작성한다.`;

  const prompt = [
    `디스코드 주식 게임 단일 종목 ${params.displayName}(${params.symbol}) 뉴스 1건을 작성해줘.`,
    `현재 가격: ${params.currentPrice.toFixed(0)}p`,
    `현재 등락률: ${params.changePct.toFixed(2)}%`,
    `최근 흐름 요약: ${params.recentSummary}`,
    `캔들 데이터 상태: ${params.dataIsSparse ? '제한적' : '충분'}`,
    `이번 기사 티어는 반드시 \`${forcedTier}\`(${forcedTierProfile.label})로 고정해.`,
    `이번 기사 감정은 반드시 \`${forcedSentiment}\`(${forcedSentimentLabel})로 고정하고, 이유 키워드 \`${reasonSeed}\`를 반드시 포함해.`,
    'body에는 가격/등락률/bps 같은 정확한 숫자를 쓰지 말고, 방향성과 분위기만 서술형으로 작성.',
    '뉴스 이유는 실제 사실일 필요 없이, 게임 내에서 발생한 이슈처럼 자연스럽게 작성.',
    `impact_bps는 절대값 정수로 ${tierBounds.lower}~${tierBounds.upper} 범위만 사용.`,
    'sentiment는 bullish/bearish/neutral 중 하나.',
    'headline은 42자 이하, body는 2~3문장으로 작성.'
  ].join('\n');

  let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: STOCK_NEWS_SCHEMA,
        systemInstruction: { parts: [{ text: systemInstruction }] }
      }
    });
  } catch (error) {
    console.warn('[StockNews] Gemini request failed:', error);
    return null;
  }

  if (!response.text) return null;

  try {
    const parsed = JSON.parse(response.text) as {
      sentiment?: unknown;
      impact_bps?: unknown;
      headline?: unknown;
      body?: unknown;
    };

    const sentiment = forcedSentiment;
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
      summary: '캔들 데이터 부족(초기 구간)',
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
  return {
    summary: `최근 12캔들 기준 ${movePct >= 0 ? '+' : ''}${movePct.toFixed(2)}%, 고가 ${maxHigh.toFixed(0)}p / 저가 ${minLow.toFixed(0)}p`,
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
}) => {
  const channel = await client.channels.fetch(params.channelId).catch(() => null);
  if (!isSendableChannel(channel)) {
    throw new Error('Configured stock news channel is not available');
  }

  const signed = params.applied.out_signed_impact_bps;
  const impactLabel = `${signed > 0 ? '+' : ''}${signed} bps`;
  const color = signed > 0 ? 0x2ecc71 : signed < 0 ? 0xe74c3c : 0x95a5a6;
  const sentimentLabel = params.draft.sentiment === 'bullish' ? '호재' : params.draft.sentiment === 'bearish' ? '악재' : '중립';
  const sentimentEmoji = params.draft.sentiment === 'bullish' ? '🟢' : params.draft.sentiment === 'bearish' ? '🔴' : '🟡';
  const tierMeta = NEWS_TIER_META[params.draft.tier];
  const moveEmoji = signed > 0 ? '📈' : signed < 0 ? '📉' : '➖';
  const priceDelta = params.applied.out_price_after - params.applied.out_price_before;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📰 ${params.displayName} 뉴스`)
    .setDescription(
      [
        `> **${params.draft.headline}**`,
        '',
        `- ${sentimentEmoji} **분류:** **${sentimentLabel}**`,
        `- ${tierMeta.emoji} **티어:** **${tierMeta.label}**`,
        `- ${moveEmoji} **영향:** \`${impactLabel}\``,
        `- 🏷️ **종목:** **${params.displayName} (${params.symbol})**`,
        '',
        '**브리핑**',
        params.draft.body
      ].join('\n')
    )
    .addFields(
      {
        name: '💹 가격 반영',
        value: `\`${params.applied.out_price_before.toLocaleString()}p\` -> \`${params.applied.out_price_after.toLocaleString()}p\`\n(${priceDelta >= 0 ? '+' : ''}${priceDelta.toLocaleString()}p)`,
        inline: false
      },
      {
        name: '📍 현재 시세',
        value: `**${params.marketPrice.toLocaleString()}p** (${params.marketChangePct >= 0 ? '+' : ''}${params.marketChangePct.toFixed(2)}%)`,
        inline: true
      },
      {
        name: '🧠 신호',
        value: `${sentimentEmoji} ${sentimentLabel} / ${tierMeta.emoji} ${tierMeta.label} / ${moveEmoji} ${impactLabel}`,
        inline: true
      },
      {
        name: '📐 기준',
        value: '`100bps = 1.00%`',
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

  const minImpactBps = clamp(Math.floor(toNumber(cfg.stock_news_min_impact_bps, 40)), MIN_IMPACT_BPS, MAX_IMPACT_BPS);
  const maxImpactBps = clamp(Math.floor(toNumber(cfg.stock_news_max_impact_bps, 260)), minImpactBps, MAX_IMPACT_BPS);
  const currentPrice = Math.max(50, toNumber(dashboard.out_price ?? dashboard.price, 0));
  const changePct = toNumber(dashboard.out_change_pct ?? dashboard.change_pct, 0);
  const marketSignal = getMarketSignal(dashboard.out_candles ?? dashboard.candles);

  const apiKey = ctx.env.STOCK_NEWS_GEMINI_API_KEY || ctx.env.GEMINI_API_KEY;
  const geminiDraft = apiKey
      ? await buildGeminiDraft({
        apiKey,
        symbol: stockTicker.symbol,
        displayName: stockTicker.displayName,
        currentPrice,
        changePct,
        recentSummary: marketSignal.summary,
        dataIsSparse: marketSignal.dataIsSparse,
        minImpactBps,
        maxImpactBps,
        scenarioSeeds
      })
    : null;

  const draft = geminiDraft ??
    buildFallbackDraft({
      minImpactBps,
      maxImpactBps,
      displayName: stockTicker.displayName,
      scenarioSeeds
    });

  const { data: applyRows, error: applyError } = await rpc<ApplyStockNewsRpcRow>('apply_stock_news_impact', {
    p_sentiment: draft.sentiment,
    p_impact_bps: draft.impactBpsAbs,
    p_headline: draft.headline,
    p_body: draft.body,
    p_source: apiKey ? 'gemini' : 'fallback',
    p_channel_id: cfg.stock_news_channel_id,
    p_metadata: {
      trigger: decision.forced ? 'manual' : 'schedule',
      model: apiKey ? 'gemini-2.5-flash-lite' : 'fallback',
      tier: draft.tier,
      data_is_sparse: marketSignal.dataIsSparse,
      candle_count: marketSignal.candleCount,
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
    draft,
    applied,
    marketPrice,
    marketChangePct,
    forced: decision.forced
  });

  const nextRunAt = getNextRunAfterSend(cfg, now);
  const { error: scheduleUpdateError } = await dynamicSupabase
    .from('app_config')
    .update({
      stock_news_last_sent_at: now.toISOString(),
      stock_news_next_run_at: nextRunAt.toISOString(),
      stock_news_force_run_at: null
    })
    .eq('id', 1);
  if (scheduleUpdateError) {
    throw new Error(`[StockNews] failed to update schedule metadata: ${scheduleUpdateError.message}`);
  }
  invalidateAppConfigCache();
}
