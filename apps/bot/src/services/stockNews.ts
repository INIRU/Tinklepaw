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
  price: number;
  change_pct: number;
  candles: unknown;
};

type ApplyStockNewsRpcRow = {
  out_event_id: number;
  out_price_before: number;
  out_price_after: number;
  out_signed_impact_bps: number;
  out_bucket_start: string;
};

type Sentiment = 'bullish' | 'bearish' | 'neutral';

type StockNewsDraft = {
  sentiment: Sentiment;
  impactBpsAbs: number;
  headline: string;
  body: string;
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
const VOLATILITY_FLOOR_RATIO = 0.55;
const MANUAL_FALLBACK_HEADLINES = [
  '쿠로 전자 대형 매수세 유입',
  '쿠로 전자 차익 실현 물량 급증',
  '쿠로 전자 급등 기대감 확산',
  '쿠로 전자 리스크 경계 매물 출회',
  '쿠로 전자 수급 쏠림으로 변동 확대'
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toNumber = (value: unknown, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const parseMaybeDate = (value: string | null | undefined) => {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
};

const getVolatilityFloorImpact = (minImpactBps: number, maxImpactBps: number) => {
  const spread = Math.max(0, maxImpactBps - minImpactBps);
  return minImpactBps + Math.floor(spread * VOLATILITY_FLOOR_RATIO);
};

const pickDirectionalSentiment = (changePct: number): Exclude<Sentiment, 'neutral'> => {
  if (changePct >= 0.15) return 'bullish';
  if (changePct <= -0.15) return 'bearish';
  return Math.random() < 0.5 ? 'bullish' : 'bearish';
};

const forceDirectionalSentiment = (sentiment: Sentiment, changePct: number): Exclude<Sentiment, 'neutral'> => {
  if (sentiment === 'neutral') return pickDirectionalSentiment(changePct);
  return sentiment;
};

const boostImpactForVolatility = (impactBpsAbs: number, minImpactBps: number, maxImpactBps: number) => {
  const floor = getVolatilityFloorImpact(minImpactBps, maxImpactBps);
  return clamp(Math.max(impactBpsAbs, floor), minImpactBps, maxImpactBps);
};

const pickHighVolatilityImpact = (minImpactBps: number, maxImpactBps: number) => {
  const floor = getVolatilityFloorImpact(minImpactBps, maxImpactBps);
  const range = Math.max(0, maxImpactBps - floor);
  return floor + Math.floor(Math.random() * (range + 1));
};

const normalizeSentiment = (value: unknown): Sentiment => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'bullish' || raw === 'bearish' || raw === 'neutral') return raw;
  return 'neutral';
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
  changePct: number;
  currentPrice: number;
}): StockNewsDraft => {
  const { minImpactBps, maxImpactBps, changePct, currentPrice } = params;

  const sentiment = pickDirectionalSentiment(changePct);
  const impactBpsAbs = pickHighVolatilityImpact(minImpactBps, maxImpactBps);
  const headline = MANUAL_FALLBACK_HEADLINES[Math.floor(Math.random() * MANUAL_FALLBACK_HEADLINES.length)] ?? '시장 변동성 확대';

  return {
    sentiment,
    impactBpsAbs,
    headline,
    body: `쿠로 전자 현재 기준가는 ${currentPrice.toLocaleString()}p 입니다. 수급이 한쪽으로 강하게 쏠리며 단기 변동성이 확대되고 있습니다.`
  };
};

const buildGeminiDraft = async (params: {
  apiKey: string;
  currentPrice: number;
  changePct: number;
  recentSummary: string;
  minImpactBps: number;
  maxImpactBps: number;
}): Promise<StockNewsDraft | null> => {
  const ai = new GoogleGenAI({ apiKey: params.apiKey });

  const systemInstruction =
    '당신은 게임 내 가상 종목 쿠로 전자 뉴스 에디터다. 반드시 JSON만 반환한다. 과장 없이 자연스러운 한국어를 사용한다. 약한 중립 표현보다 방향성과 변동성을 분명히 드러낸다.';

  const prompt = [
    '쿠로 전자 종목 뉴스 1건을 작성해줘.',
    `현재 가격: ${params.currentPrice.toFixed(0)}p`,
    `현재 등락률: ${params.changePct.toFixed(2)}%`,
    `최근 흐름 요약: ${params.recentSummary}`,
    `impact_bps는 절대값 정수로 ${params.minImpactBps}~${params.maxImpactBps} 범위만 허용하고, 가능하면 변동성이 강하게 보이도록 범위 상단을 우선 사용.`,
    'sentiment는 bullish 또는 bearish 중 하나를 기본으로 사용. neutral은 극히 예외적인 상황에서만 사용.',
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

    const sentiment = forceDirectionalSentiment(normalizeSentiment(parsed.sentiment), params.changePct);
    const impactBpsAbs = boostImpactForVolatility(
      clamp(Math.abs(Math.floor(toNumber(parsed.impact_bps, 0))), params.minImpactBps, params.maxImpactBps),
      params.minImpactBps,
      params.maxImpactBps
    );
    const headline = String(parsed.headline ?? '').trim();
    const body = String(parsed.body ?? '').trim();
    if (!headline || !body) return null;

    return {
      sentiment,
      impactBpsAbs,
      headline: headline.slice(0, 120),
      body: body.slice(0, 800)
    };
  } catch (error) {
    console.warn('[StockNews] Gemini parse failed:', error);
    return null;
  }
};

const getRecentSummary = (candlesRaw: unknown) => {
  if (!Array.isArray(candlesRaw) || candlesRaw.length < 2) return '데이터 부족';
  const candles = candlesRaw.slice(-12) as Array<Record<string, unknown>>;
  const first = candles[0] ?? {};
  const last = candles[candles.length - 1] ?? {};
  const open = toNumber(first.o ?? first.open_price, 0);
  const close = toNumber(last.c ?? last.close_price, open);
  const maxHigh = candles.reduce((acc, row) => Math.max(acc, toNumber(row.h ?? row.high_price, acc)), open);
  const minLow = candles.reduce((acc, row) => Math.min(acc, toNumber(row.l ?? row.low_price, acc)), open || Infinity);
  const movePct = open > 0 ? ((close - open) / open) * 100 : 0;
  return `최근 12캔들 기준 ${movePct >= 0 ? '+' : ''}${movePct.toFixed(2)}%, 고가 ${maxHigh.toFixed(0)}p / 저가 ${minLow.toFixed(0)}p`;
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
  draft: StockNewsDraft;
  applied: ApplyStockNewsRpcRow;
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

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('쿠로 전자 뉴스')
    .setDescription(`**${params.draft.headline}**\n${params.draft.body}`)
    .addFields(
      { name: '분류', value: sentimentLabel, inline: true },
      { name: '영향', value: impactLabel, inline: true },
      {
        name: '가격 변동',
        value: `${params.applied.out_price_before.toLocaleString()}p -> ${params.applied.out_price_after.toLocaleString()}p`,
        inline: false
      }
    )
    .setFooter({ text: params.forced ? '수동 생성' : '자동 생성' })
    .setTimestamp(new Date());

  await channel.send({ embeds: [embed] });
};

export async function runStockNewsCycle(client: Client): Promise<void> {
  const cfg = await getAppConfig();
  if (!cfg.stock_news_enabled || !cfg.stock_news_channel_id) return;

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

  const minImpactBps = clamp(Math.floor(toNumber(cfg.stock_news_min_impact_bps, 40)), MIN_IMPACT_BPS, MAX_IMPACT_BPS);
  const maxImpactBps = clamp(Math.floor(toNumber(cfg.stock_news_max_impact_bps, 260)), minImpactBps, MAX_IMPACT_BPS);
  const currentPrice = toNumber(dashboard.price, 0);
  const changePct = toNumber(dashboard.change_pct, 0);

  const apiKey = ctx.env.STOCK_NEWS_GEMINI_API_KEY || ctx.env.GEMINI_API_KEY;
  const geminiDraft = apiKey
    ? await buildGeminiDraft({
        apiKey,
        currentPrice,
        changePct,
        recentSummary: getRecentSummary(dashboard.candles),
        minImpactBps,
        maxImpactBps
      })
    : null;

  const draft = geminiDraft ??
    buildFallbackDraft({
      minImpactBps,
      maxImpactBps,
      changePct,
      currentPrice
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
      generated_at: now.toISOString()
    }
  });

  if (applyError) {
    throw new Error(`[StockNews] apply_stock_news_impact failed: ${applyError.message}`);
  }

  const applied = Array.isArray(applyRows) ? applyRows[0] : null;
  if (!applied) throw new Error('[StockNews] apply_stock_news_impact returned empty payload');

  await sendNewsMessage(client, {
    channelId: cfg.stock_news_channel_id,
    draft,
    applied,
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
