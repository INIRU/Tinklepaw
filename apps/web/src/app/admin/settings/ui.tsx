'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import NextImage from 'next/image';
import MarkdownPreview from '@/components/content/MarkdownPreview';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { useToast } from '@/components/toast/ToastProvider';
import { Check, ChevronDown, ChevronLeft } from 'lucide-react';

type AppConfig = {
  server_intro?: string | null;
  banner_image_url?: string | null;
  icon_image_url?: string | null;
  join_message_template: string | null;
  join_message_channel_id: string | null;
  voice_interface_trigger_channel_id: string | null;
  voice_interface_category_id: string | null;
  maintenance_mode_enabled: boolean;
  maintenance_mode_reason: string | null;
  maintenance_mode_until: string | null;
  maintenance_web_target_paths: string[];
  maintenance_bot_target_commands: string[];
  reward_points_per_interval: number;
  reward_interval_seconds: number;
  reward_daily_cap_points: number | null;
  reward_min_message_length: number;
  booster_chat_bonus_points: number;
  voice_reward_points_per_interval: number;
  voice_reward_interval_seconds: number;
  voice_reward_daily_cap_points: number | null;
  booster_voice_bonus_points: number;
  daily_chest_legendary_rate_pct: number;
  daily_chest_epic_rate_pct: number;
  daily_chest_rare_rate_pct: number;
  daily_chest_common_min_points: number;
  daily_chest_common_max_points: number;
  daily_chest_rare_min_points: number;
  daily_chest_rare_max_points: number;
  daily_chest_epic_min_points: number;
  daily_chest_epic_max_points: number;
  daily_chest_legendary_min_points: number;
  daily_chest_legendary_max_points: number;
  daily_chest_item_drop_rate_pct: number;
  duplicate_ss_tuna_energy: number;
  duplicate_sss_tuna_energy: number;
  lottery_jackpot_rate_pct: number;
  lottery_gold_rate_pct: number;
  lottery_silver_rate_pct: number;
  lottery_bronze_rate_pct: number;
  lottery_ticket_cooldown_seconds: number;
  lottery_ticket_price: number;
  lottery_jackpot_base_points: number;
  lottery_gold_payout_points: number;
  lottery_silver_payout_points: number;
  lottery_bronze_payout_points: number;
  lottery_jackpot_pool_points: number;
  lottery_activity_jackpot_rate_pct: number;
  stock_news_enabled: boolean;
  stock_news_channel_id: string | null;
  stock_news_schedule_mode: 'interval' | 'daily_random';
  stock_news_interval_minutes: number;
  stock_news_signal_duration_rumor_minutes: number;
  stock_news_signal_duration_mixed_minutes: number;
  stock_news_signal_duration_confirmed_minutes: number;
  stock_news_signal_duration_reversal_minutes: number;
  stock_news_signal_duration_max_minutes: number;
  stock_news_daily_window_start_hour: number;
  stock_news_daily_window_end_hour: number;
  stock_news_bullish_min_impact_bps: number;
  stock_news_bullish_max_impact_bps: number;
  stock_news_bearish_min_impact_bps: number;
  stock_news_bearish_max_impact_bps: number;
  stock_news_bullish_scenarios: string[];
  stock_news_bearish_scenarios: string[];
  stock_whale_max_buy_qty: number;
  stock_whale_max_sell_qty: number;
  stock_shrimp_max_buy_qty: number;
  stock_shrimp_max_sell_qty: number;
  stock_ant_auto_buy_qty: number;
  stock_ant_auto_buy_cooldown_seconds: number;
  stock_market_maker_interval_ms: number | null;
  stock_holding_fee_enabled: boolean;
  stock_holding_fee_daily_bps: number;
  stock_holding_fee_daily_cap_bps: number;
  stock_holding_fee_timezone: string;
  stock_holding_fee_last_applied_on?: string | null;
  stock_news_last_sent_at?: string | null;
  stock_news_next_run_at?: string | null;
  stock_news_force_run_at?: string | null;
  stock_news_force_sentiment?: 'bullish' | 'bearish' | 'neutral' | null;
  stock_news_force_tier?: 'general' | 'rare' | 'shock' | null;
  stock_news_force_scenario?: string | null;
};

type StockNewsForceSentimentOption = 'auto' | 'bullish' | 'bearish' | 'neutral';
type StockNewsForceTierOption = 'auto' | 'general' | 'rare' | 'shock';

type SettingsTab = 'general' | 'maintenance' | 'stock' | 'economy';

type DiscordChannel = { id: string; name: string; type: number; parent_id?: string | null };

type AssetKey = 'banner' | 'icon';
type StagedAsset = { stagedPath: string; publicUrl: string };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

const MAX_SCENARIO_LINES = 64;
const MAX_FORCE_SCENARIO_LENGTH = 120;

const DEFAULT_BULLISH_SCENARIOS = [
  '차세대 제품 쇼케이스 기대감 확산',
  '대형 파트너십 체결 루머 확산',
  '핵심 엔지니어 팀 합류 소식',
  '기관성 매수세 유입 추정',
  '해외 커뮤니티에서 기술력 재평가'
];

const DEFAULT_BEARISH_SCENARIOS = [
  '생산 라인 점검 이슈 부각',
  '핵심 부품 수급 지연 우려 확대',
  '경영진 발언 해석 논란 확산',
  '단기 차익 실현 물량 집중',
  '경쟁사 공세 심화 관측'
];

const GACHA_TUNA_ENERGY_PRESETS = [
  {
    key: 'balanced',
    label: '균형형',
    ss: 1,
    sss: 2,
    description: '기본 추천값'
  },
  {
    key: 'aggressive',
    label: '가속형',
    ss: 2,
    sss: 4,
    description: '강화 체감 빠름'
  },
  {
    key: 'rare-focused',
    label: '희귀 집중형',
    ss: 1,
    sss: 3,
    description: 'SSS 중복 가치 강화'
  },
  {
    key: 'reset',
    label: '초기화',
    ss: 0,
    sss: 0,
    description: '지급 비활성'
  }
] as const;

function normalizeScenarioList(input: unknown, fallback: string[]) {
  if (!Array.isArray(input)) return [...fallback];
  const items = input.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, MAX_SCENARIO_LINES);
  return items.length > 0 ? items : [...fallback];
}

function parseScenarioLines(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_SCENARIO_LINES);
}

function formatScenarioLines(lines: string[]) {
  return (lines ?? []).join('\n');
}

function toDateTimeLocalInput(value: string | null | undefined) {
  if (!value) return '';
  const at = new Date(value);
  if (!Number.isFinite(at.getTime())) return '';

  const yyyy = at.getFullYear();
  const mm = String(at.getMonth() + 1).padStart(2, '0');
  const dd = String(at.getDate()).padStart(2, '0');
  const hh = String(at.getHours()).padStart(2, '0');
  const mi = String(at.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function fromDateTimeLocalInput(value: string) {
  if (!value.trim()) return null;
  const at = new Date(value);
  if (!Number.isFinite(at.getTime())) return null;
  return at.toISOString();
}

function parseLineList(raw: string, limit = 128) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function formatLineList(lines: string[]) {
  return (lines ?? []).join('\n');
}

function normalizeMaintenancePathList(items: string[]) {
  const normalized = items
    .map((item) => (item.startsWith('/') ? item : `/${item}`))
    .map((item) => (item === '/' ? item : item.replace(/\/+$/, '')))
    .slice(0, 128);
  return Array.from(new Set(normalized));
}

function normalizeMaintenanceCommandList(items: string[]) {
  const normalized = items
    .map((item) => item.toLowerCase())
    .map((item) => item.replace(/^\/+/, ''))
    .map((item) => item.replace(/[^a-z0-9_-]/g, ''))
    .filter(Boolean)
    .slice(0, 128);
  return Array.from(new Set(normalized));
}

const GENERAL_DIRTY_KEYS: ReadonlyArray<keyof AppConfig> = [
  'server_intro',
  'banner_image_url',
  'icon_image_url',
  'join_message_template',
  'join_message_channel_id',
  'voice_interface_trigger_channel_id',
  'voice_interface_category_id',
  'maintenance_mode_enabled',
  'maintenance_mode_reason',
  'maintenance_mode_until',
  'maintenance_web_target_paths',
  'maintenance_bot_target_commands'
];

const STOCK_DIRTY_KEYS: ReadonlyArray<keyof AppConfig> = [
  'stock_news_enabled',
  'stock_news_channel_id',
  'stock_news_schedule_mode',
  'stock_news_interval_minutes',
  'stock_news_signal_duration_rumor_minutes',
  'stock_news_signal_duration_mixed_minutes',
  'stock_news_signal_duration_confirmed_minutes',
  'stock_news_signal_duration_reversal_minutes',
  'stock_news_signal_duration_max_minutes',
  'stock_news_daily_window_start_hour',
  'stock_news_daily_window_end_hour',
  'stock_news_bullish_min_impact_bps',
  'stock_news_bullish_max_impact_bps',
  'stock_news_bearish_min_impact_bps',
  'stock_news_bearish_max_impact_bps',
  'stock_news_bullish_scenarios',
  'stock_news_bearish_scenarios',
  'stock_whale_max_buy_qty',
  'stock_whale_max_sell_qty',
  'stock_shrimp_max_buy_qty',
  'stock_shrimp_max_sell_qty',
  'stock_ant_auto_buy_qty',
  'stock_ant_auto_buy_cooldown_seconds',
  'stock_market_maker_interval_ms',
  'stock_holding_fee_enabled',
  'stock_holding_fee_daily_bps',
  'stock_holding_fee_daily_cap_bps',
  'stock_holding_fee_timezone'
];

const ECONOMY_DIRTY_KEYS: ReadonlyArray<keyof AppConfig> = [
  'reward_points_per_interval',
  'reward_interval_seconds',
  'reward_daily_cap_points',
  'reward_min_message_length',
  'booster_chat_bonus_points',
  'voice_reward_points_per_interval',
  'voice_reward_interval_seconds',
  'voice_reward_daily_cap_points',
  'booster_voice_bonus_points',
  'daily_chest_legendary_rate_pct',
  'daily_chest_epic_rate_pct',
  'daily_chest_rare_rate_pct',
  'daily_chest_common_min_points',
  'daily_chest_common_max_points',
  'daily_chest_rare_min_points',
  'daily_chest_rare_max_points',
  'daily_chest_epic_min_points',
  'daily_chest_epic_max_points',
  'daily_chest_legendary_min_points',
  'daily_chest_legendary_max_points',
  'daily_chest_item_drop_rate_pct',
  'duplicate_ss_tuna_energy',
  'duplicate_sss_tuna_energy',
  'lottery_jackpot_rate_pct',
  'lottery_gold_rate_pct',
  'lottery_silver_rate_pct',
  'lottery_bronze_rate_pct',
  'lottery_ticket_cooldown_seconds',
  'lottery_ticket_price',
  'lottery_jackpot_base_points',
  'lottery_gold_payout_points',
  'lottery_silver_payout_points',
  'lottery_bronze_payout_points',
  'lottery_jackpot_pool_points',
  'lottery_activity_jackpot_rate_pct'
];

function cloneConfigSnapshot(snapshot: AppConfig): AppConfig {
  return {
    ...snapshot,
    stock_news_bullish_scenarios: [...snapshot.stock_news_bullish_scenarios],
    stock_news_bearish_scenarios: [...snapshot.stock_news_bearish_scenarios],
    maintenance_web_target_paths: [...snapshot.maintenance_web_target_paths],
    maintenance_bot_target_commands: [...snapshot.maintenance_bot_target_commands]
  };
}

function isSameStringList(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function isSameConfigValue(left: AppConfig[keyof AppConfig], right: AppConfig[keyof AppConfig]) {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return isSameStringList(left, right);
  }
  return left === right;
}

function hasConfigChangesForKeys(
  current: AppConfig | null,
  saved: AppConfig | null,
  keys: ReadonlyArray<keyof AppConfig>
) {
  if (!current || !saved) return false;
  return keys.some((key) => !isSameConfigValue(current[key], saved[key]));
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ width: Math.max(1, r.width), height: Math.max(1, r.height) });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}

async function loadHtmlImage(src: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    img.src = src;
  });
}

async function canvasToPngFile(canvas: HTMLCanvasElement, name: string) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 생성 실패'))), 'image/png');
  });
  return new File([blob], name, { type: 'image/png' });
}

function CropModal(props: {
  title: string;
  src: string;
  aspect: number;
  output: { width: number; height: number; fileName: string };
  onClose: () => void;
  onConfirm: (file: File) => void;
  busy?: boolean;
}) {
  const { ref: frameRef, size: frameSize } = useElementSize<HTMLDivElement>();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    setLocalError(null);
    loadHtmlImage(props.src)
      .then((loaded) => {
        if (!alive) return;
        setImg(loaded);
      })
      .catch(() => {
        if (!alive) return;
        setImg(null);
        setLocalError('이미지를 미리보기에 불러오지 못했습니다. GIF 파일은 현재 자르기를 지원하지 않습니다.');
      });
    return () => {
      alive = false;
    };
  }, [props.src]);

  const baseScale = useMemo(() => {
    if (!img) return 1;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const fw = frameSize.width;
    const fh = frameSize.height;
    return Math.max(fw / iw, fh / ih);
  }, [img, frameSize.height, frameSize.width]);

  const clampedOffset = useMemo(() => {
    if (!img) return offset;
    const s = baseScale * zoom;
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    const maxX = Math.max(0, (dw - frameSize.width) / 2);
    const maxY = Math.max(0, (dh - frameSize.height) / 2);
    return {
      x: clamp(offset.x, -maxX, maxX),
      y: clamp(offset.y, -maxY, maxY)
    };
  }, [baseScale, frameSize.height, frameSize.width, img, offset, zoom]);

  useEffect(() => {
    setOffset(clampedOffset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedOffset.x, clampedOffset.y]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!img) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: clampedOffset.x,
      startOffsetY: clampedOffset.y
    };
  }, [clampedOffset.x, clampedOffset.y, img]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset({ x: dragRef.current.startOffsetX + dx, y: dragRef.current.startOffsetY + dy });
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const confirm = useCallback(async () => {
    if (!img) return;
    setLocalError(null);
    try {
      const fw = frameSize.width;
      const fh = frameSize.height;
      const s = baseScale * zoom;

      const sx = img.naturalWidth / 2 + (-fw / 2 - clampedOffset.x) / s;
      const sy = img.naturalHeight / 2 + (-fh / 2 - clampedOffset.y) / s;
      const sw = fw / s;
      const sh = fh / s;

      const canvas = document.createElement('canvas');
      canvas.width = props.output.width;
      canvas.height = props.output.height;
      const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('캔버스를 초기화하지 못했습니다.');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

      const file = await canvasToPngFile(canvas, props.output.fileName);
      props.onConfirm(file);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : '이미지 생성 실패');
    }
  }, [baseScale, clampedOffset.x, clampedOffset.y, frameSize.height, frameSize.width, img, props, zoom]);

  const frameStyle: React.CSSProperties = {
    aspectRatio: `${props.aspect}`
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => (props.busy ? null : props.onClose())} />
      <div className="relative w-full max-w-2xl rounded-3xl card-glass p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{props.title}</div>
            <div className="mt-1 text-xs muted">드래그로 위치를 조정하고, 확대/축소로 잘라 주세요.</div>
          </div>
          <button
            type="button"
            className="rounded-xl btn-soft px-3 py-2 text-xs"
            onClick={() => (props.busy ? null : props.onClose())}
          >
            닫기
          </button>
        </div>

        <div className="mt-4">
          <div
            ref={frameRef}
            className="relative w-full overflow-hidden rounded-2xl border border-[color:var(--border)] bg-black/20"
            style={frameStyle}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {img ? (
              <NextImage
                src={props.src}
                alt=""
                width={img.naturalWidth}
                height={img.naturalHeight}
                unoptimized
                loader={({ src }) => src}
                className="absolute left-1/2 top-1/2 max-w-none select-none"
                draggable={false}
                style={{
                  transform: `translate(-50%, -50%) translate(${clampedOffset.x}px, ${clampedOffset.y}px) scale(${baseScale * zoom})`,
                  transformOrigin: 'center'
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-center text-sm muted px-4">
                {localError ?? '불러오는 중…'}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs">
              <span className="muted">확대</span>
              <input
                type="range"
                min={1}
                max={4}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-48"
              />
            </label>
            <button
              type="button"
              className="rounded-xl btn-soft px-3 py-2 text-xs"
              onClick={() => {
                setZoom(1);
                setOffset({ x: 0, y: 0 });
              }}
              disabled={props.busy}
            >
              리셋
            </button>
            <button
              type="button"
              className="rounded-2xl btn-bangul px-4 py-2 text-xs font-semibold disabled:opacity-60"
              onClick={() => void confirm()}
              disabled={!img || props.busy}
            >
              {props.busy ? '업로드 중…' : '확정'}
            </button>
            {localError ? <div className="text-xs text-red-200">{localError}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsClient() {
  const toast = useToast();
  const router = useRouter();
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [savedCfg, setSavedCfg] = useState<AppConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [rewardChannels, setRewardChannels] = useState<string[]>([]); // draft
  const [rewardChannelsSaved, setRewardChannelsSaved] = useState<string[]>([]);
  const [rewardSearch, setRewardSearch] = useState('');
  const [rewardSaving, setRewardSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newsTriggering, setNewsTriggering] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [bullishScenarioDraft, setBullishScenarioDraft] = useState('');
  const [bearishScenarioDraft, setBearishScenarioDraft] = useState('');
  const [forcedNewsSentiment, setForcedNewsSentiment] = useState<StockNewsForceSentimentOption>('auto');
  const [forcedNewsTier, setForcedNewsTier] = useState<StockNewsForceTierOption>('auto');
  const [forcedNewsScenario, setForcedNewsScenario] = useState('');

  const [stagedBanner, setStagedBanner] = useState<StagedAsset | null>(null);
  const [stagedIcon, setStagedIcon] = useState<StagedAsset | null>(null);
  const [assetBusy, setAssetBusy] = useState<{ key: AssetKey; op: 'stage' | 'commit' | 'cancel' } | null>(null);
  const [crop, setCrop] = useState<{ key: AssetKey; srcUrl: string } | null>(null);

  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const iconInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (crop?.srcUrl) URL.revokeObjectURL(crop.srcUrl);
    };
  }, [crop?.srcUrl]);

  const rewardChannelSet = useMemo(() => new Set(rewardChannels), [rewardChannels]);
  const rewardChannelSavedSet = useMemo(() => new Set(rewardChannelsSaved), [rewardChannelsSaved]);
  const textChannels = useMemo(() => channels.filter((c) => c.type === 0 || c.type === 5), [channels]);
  const voiceChannels = useMemo(() => channels.filter((c) => c.type === 2), [channels]);
  const categoryChannels = useMemo(() => channels.filter((c) => c.type === 4), [channels]);
  const stockNewsChannelOptions = useMemo(
    () => [{ value: '', label: '선택 안 함' }, ...textChannels.map((c) => ({ value: c.id, label: `#${c.name}` }))],
    [textChannels]
  );
  const stockNewsScheduleOptions = useMemo(
    () => [
      { value: 'interval', label: '간격 반복' },
      { value: 'daily_random', label: '하루 1회 랜덤' }
    ],
    []
  );
  const stockNewsForceSentimentOptions = useMemo(
    () => [
      { value: 'auto', label: '자동(랜덤)' },
      { value: 'bullish', label: '호재' },
      { value: 'bearish', label: '악재' },
      { value: 'neutral', label: '중립' }
    ],
    []
  );
  const stockNewsForceTierOptions = useMemo(
    () => [
      { value: 'auto', label: '자동(랜덤)' },
      { value: 'general', label: '일반' },
      { value: 'rare', label: '희귀' },
      { value: 'shock', label: '충격' }
    ],
    []
  );
  const categoryNameById = useMemo(
    () => new Map(categoryChannels.map((c) => [c.id, c.name])),
    [categoryChannels]
  );

  const loadAll = useCallback(async () => {
    const cfgRes = await fetch('/api/admin/config');
    const cfgBody = (await cfgRes.json().catch(() => null)) as (AppConfig & { error?: string }) | null;
    if (!cfgRes.ok) {
      throw new Error(cfgBody?.error ?? `HTTP ${cfgRes.status}`);
    }
    if (!cfgBody) {
      throw new Error('설정 데이터를 불러오지 못했습니다.');
    }

    const bullishScenarios = normalizeScenarioList(cfgBody.stock_news_bullish_scenarios, DEFAULT_BULLISH_SCENARIOS);
    const bearishScenarios = normalizeScenarioList(cfgBody.stock_news_bearish_scenarios, DEFAULT_BEARISH_SCENARIOS);
    const legacyMinImpactBps = Number((cfgBody as { stock_news_min_impact_bps?: number }).stock_news_min_impact_bps ?? 40);
    const legacyMaxImpactBps = Number((cfgBody as { stock_news_max_impact_bps?: number }).stock_news_max_impact_bps ?? 260);
    const maintenanceReason =
      typeof (cfgBody as { maintenance_mode_reason?: string | null }).maintenance_mode_reason === 'string'
        ? (cfgBody as { maintenance_mode_reason?: string | null }).maintenance_mode_reason!.trim()
        : '';
    const rawMaintenanceUntil =
      typeof (cfgBody as { maintenance_mode_until?: string | null }).maintenance_mode_until === 'string'
        ? (cfgBody as { maintenance_mode_until?: string | null }).maintenance_mode_until
        : null;
    const maintenanceWebTargetsRawValue =
      (cfgBody as { maintenance_web_target_paths?: unknown[] }).maintenance_web_target_paths;
    const maintenanceBotTargetsRawValue =
      (cfgBody as { maintenance_bot_target_commands?: unknown[] }).maintenance_bot_target_commands;
    const maintenanceWebTargetsRaw: unknown[] = Array.isArray(maintenanceWebTargetsRawValue)
      ? maintenanceWebTargetsRawValue
      : [];
    const maintenanceBotTargetsRaw: unknown[] = Array.isArray(maintenanceBotTargetsRawValue)
      ? maintenanceBotTargetsRawValue
      : [];
    const maintenanceWebTargets = normalizeMaintenancePathList(
      maintenanceWebTargetsRaw.map((item) => String(item ?? '').trim()).filter(Boolean)
    );
    const maintenanceBotTargets = normalizeMaintenanceCommandList(
      maintenanceBotTargetsRaw.map((item) => String(item ?? '').trim()).filter(Boolean)
    );
    const parsedMaintenanceUntil = rawMaintenanceUntil && Number.isFinite(Date.parse(rawMaintenanceUntil))
      ? new Date(rawMaintenanceUntil).toISOString()
      : null;

    const normalizedCfg = cloneConfigSnapshot({
      ...(cfgBody as AppConfig),
      join_message_template: cfgBody.join_message_template ?? null,
      join_message_channel_id: cfgBody.join_message_channel_id ?? null,
      voice_interface_trigger_channel_id: cfgBody.voice_interface_trigger_channel_id ?? null,
      voice_interface_category_id: cfgBody.voice_interface_category_id ?? null,
      maintenance_mode_enabled: Boolean((cfgBody as { maintenance_mode_enabled?: boolean }).maintenance_mode_enabled ?? false),
      maintenance_mode_reason: maintenanceReason.length > 0 ? maintenanceReason : null,
      maintenance_mode_until: parsedMaintenanceUntil,
      maintenance_web_target_paths: maintenanceWebTargets,
      maintenance_bot_target_commands: maintenanceBotTargets,
      stock_news_enabled: Boolean(cfgBody.stock_news_enabled ?? false),
      stock_news_channel_id: cfgBody.stock_news_channel_id ?? null,
      stock_news_schedule_mode: cfgBody.stock_news_schedule_mode === 'daily_random' ? 'daily_random' : 'interval',
      stock_news_interval_minutes: Number(cfgBody.stock_news_interval_minutes ?? 60),
      stock_news_signal_duration_rumor_minutes: Number(cfgBody.stock_news_signal_duration_rumor_minutes ?? 15),
      stock_news_signal_duration_mixed_minutes: Number(cfgBody.stock_news_signal_duration_mixed_minutes ?? 35),
      stock_news_signal_duration_confirmed_minutes: Number(cfgBody.stock_news_signal_duration_confirmed_minutes ?? 60),
      stock_news_signal_duration_reversal_minutes: Number(cfgBody.stock_news_signal_duration_reversal_minutes ?? 12),
      stock_news_signal_duration_max_minutes: Number(cfgBody.stock_news_signal_duration_max_minutes ?? 180),
      stock_news_daily_window_start_hour: Number(cfgBody.stock_news_daily_window_start_hour ?? 9),
      stock_news_daily_window_end_hour: Number(cfgBody.stock_news_daily_window_end_hour ?? 23),
      stock_news_bullish_min_impact_bps: Number(cfgBody.stock_news_bullish_min_impact_bps ?? legacyMinImpactBps),
      stock_news_bullish_max_impact_bps: Number(cfgBody.stock_news_bullish_max_impact_bps ?? legacyMaxImpactBps),
      stock_news_bearish_min_impact_bps: Number(cfgBody.stock_news_bearish_min_impact_bps ?? legacyMinImpactBps),
      stock_news_bearish_max_impact_bps: Number(cfgBody.stock_news_bearish_max_impact_bps ?? legacyMaxImpactBps),
      stock_news_bullish_scenarios: bullishScenarios,
      stock_news_bearish_scenarios: bearishScenarios,
      stock_whale_max_buy_qty: Number(cfgBody.stock_whale_max_buy_qty ?? 320),
      stock_whale_max_sell_qty: Number(cfgBody.stock_whale_max_sell_qty ?? 320),
      stock_shrimp_max_buy_qty: Number(cfgBody.stock_shrimp_max_buy_qty ?? 28),
      stock_shrimp_max_sell_qty: Number(cfgBody.stock_shrimp_max_sell_qty ?? 28),
      stock_ant_auto_buy_qty: Number(cfgBody.stock_ant_auto_buy_qty ?? 8),
      stock_ant_auto_buy_cooldown_seconds: Number(cfgBody.stock_ant_auto_buy_cooldown_seconds ?? 120),
      stock_market_maker_interval_ms:
        cfgBody.stock_market_maker_interval_ms == null
          ? null
          : Number(cfgBody.stock_market_maker_interval_ms),
      stock_holding_fee_enabled: Boolean(cfgBody.stock_holding_fee_enabled ?? true),
      stock_holding_fee_daily_bps: Number(cfgBody.stock_holding_fee_daily_bps ?? 8),
      stock_holding_fee_daily_cap_bps: Number(cfgBody.stock_holding_fee_daily_cap_bps ?? 20),
      stock_holding_fee_timezone: String(cfgBody.stock_holding_fee_timezone ?? 'Asia/Seoul'),
      stock_holding_fee_last_applied_on: cfgBody.stock_holding_fee_last_applied_on ?? null,
      stock_news_last_sent_at: cfgBody.stock_news_last_sent_at ?? null,
      stock_news_next_run_at: cfgBody.stock_news_next_run_at ?? null,
      stock_news_force_run_at: cfgBody.stock_news_force_run_at ?? null,
      stock_news_force_sentiment: cfgBody.stock_news_force_sentiment ?? null,
      stock_news_force_tier: cfgBody.stock_news_force_tier ?? null,
      stock_news_force_scenario: cfgBody.stock_news_force_scenario ?? null,
      lottery_activity_jackpot_rate_pct: Number(cfgBody.lottery_activity_jackpot_rate_pct ?? 10),
    });
    setCfg(cloneConfigSnapshot(normalizedCfg));
    setSavedCfg(cloneConfigSnapshot(normalizedCfg));
    setBullishScenarioDraft(formatScenarioLines(bullishScenarios));
    setBearishScenarioDraft(formatScenarioLines(bearishScenarios));
    setLoadError(null);

    const [chRes, rcRes] = await Promise.all([
      fetch('/api/admin/discord/channels'),
      fetch('/api/admin/reward-channels')
    ]);

    const chBody = (await chRes.json().catch(() => null)) as ({ channels?: DiscordChannel[]; error?: string } | null);
    if (!chRes.ok) {
      toast.error(chBody?.error ?? `채널을 불러오지 못했습니다. (HTTP ${chRes.status})`);
    } else {
      setChannels(chBody?.channels ?? []);
    }

    const rcBody = (await rcRes.json().catch(() => null)) as (
      | { channels?: Array<{ channel_id: string; enabled: boolean }>; error?: string }
      | null
    );
    if (!rcRes.ok) {
      console.error('Failed to load reward channels', rcBody?.error);
      toast.error(rcBody?.error ?? `보상 채널을 불러오지 못했습니다. (HTTP ${rcRes.status})`);
    } else {
      const channelsFromDb = rcBody?.channels ?? [];
      const enabledIds = channelsFromDb.filter((c) => c.enabled).map((c) => c.channel_id);
      console.log('Loaded reward channels:', enabledIds);
      setRewardChannels(enabledIds);
      setRewardChannelsSaved(enabledIds);
    }
  }, [toast]);

  useEffect(() => {
    void loadAll().catch((e) => {
      console.error('admin settings init failed', e);
      const msg = e instanceof Error ? e.message : '설정을 불러오지 못했습니다.';
      setLoadError(msg);
      toast.error('설정을 불러오지 못했습니다.');
    });
  }, [loadAll, toast]);

  const saveConfig = useCallback(async (): Promise<boolean> => {
    if (!cfg) return false;
    setSaving(true);
    try {
      const bullishScenarios = parseScenarioLines(bullishScenarioDraft);
      const bearishScenarios = parseScenarioLines(bearishScenarioDraft);

      const nextCfg: AppConfig = {
        ...cfg,
        stock_news_bullish_scenarios: bullishScenarios.length > 0 ? bullishScenarios : [...DEFAULT_BULLISH_SCENARIOS],
        stock_news_bearish_scenarios: bearishScenarios.length > 0 ? bearishScenarios : [...DEFAULT_BEARISH_SCENARIOS]
      };

      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextCfg)
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }

      const savedCfg = (await res.json()) as AppConfig;
      const normalizedBullish = normalizeScenarioList(savedCfg.stock_news_bullish_scenarios, DEFAULT_BULLISH_SCENARIOS);
      const normalizedBearish = normalizeScenarioList(savedCfg.stock_news_bearish_scenarios, DEFAULT_BEARISH_SCENARIOS);

      const normalizedSavedCfg = cloneConfigSnapshot({
        ...savedCfg,
        stock_news_bullish_scenarios: normalizedBullish,
        stock_news_bearish_scenarios: normalizedBearish
      });
      setCfg(cloneConfigSnapshot(normalizedSavedCfg));
      setSavedCfg(cloneConfigSnapshot(normalizedSavedCfg));
      setBullishScenarioDraft(formatScenarioLines(normalizedBullish));
      setBearishScenarioDraft(formatScenarioLines(normalizedBearish));
      toast.success('저장했습니다.');
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장에 실패했습니다.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [bearishScenarioDraft, bullishScenarioDraft, cfg, toast]);

  const triggerStockNewsNow = useCallback(async () => {
    setNewsTriggering(true);
    try {
      const res = await fetch('/api/admin/stock/news/trigger', {
        method: 'POST'
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      toast.success('기사 생성 요청을 등록했습니다. 잠시 후 지정 채널에 전송됩니다.');
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '기사 생성 요청에 실패했습니다.');
    } finally {
      setNewsTriggering(false);
    }
  }, [loadAll, toast]);

  const triggerForcedStockNews = useCallback(async () => {
    const compactScenario = forcedNewsScenario.replace(/\s+/g, ' ').trim();
    const payload = {
      sentiment: forcedNewsSentiment === 'auto' ? null : forcedNewsSentiment,
      tier: forcedNewsTier === 'auto' ? null : forcedNewsTier,
      scenario: compactScenario ? compactScenario.slice(0, MAX_FORCE_SCENARIO_LENGTH) : null,
    };

    setNewsTriggering(true);
    try {
      const res = await fetch('/api/admin/stock/news/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      toast.success('조작 기사 생성 요청을 등록했습니다. 잠시 후 지정 채널에 전송됩니다.');
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '조작 기사 생성 요청에 실패했습니다.');
    } finally {
      setNewsTriggering(false);
    }
  }, [forcedNewsScenario, forcedNewsSentiment, forcedNewsTier, loadAll, toast]);

  const toggleRewardChannel = useCallback(
    (channelId: string) => {
      setRewardChannels((prev) => {
        const s = new Set(prev);
        if (s.has(channelId)) s.delete(channelId);
        else s.add(channelId);
        return Array.from(s);
      });
    },
    []
  );

  const filteredRewardChannels = useMemo(() => {
    const q = rewardSearch.trim().toLowerCase();
    const base = q
      ? textChannels.filter((c) => c.name.toLowerCase().includes(q) || c.id.includes(q))
      : textChannels;
    return [...base].sort((a, b) => {
      const aOn = rewardChannelSet.has(a.id);
      const bOn = rewardChannelSet.has(b.id);
      if (aOn !== bOn) return aOn ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [rewardChannelSet, rewardSearch, textChannels]);

  const rewardDirty = useMemo(() => {
    if (rewardChannels.length !== rewardChannelsSaved.length) return true;
    for (const id of rewardChannels) if (!rewardChannelSavedSet.has(id)) return true;
    return false;
  }, [rewardChannelSavedSet, rewardChannels, rewardChannelsSaved.length]);

  const selectAllFiltered = useCallback(() => {
    setRewardChannels((prev) => {
      const s = new Set(prev);
      for (const c of filteredRewardChannels) s.add(c.id);
      return Array.from(s);
    });
  }, [filteredRewardChannels]);

  const clearFiltered = useCallback(() => {
    setRewardChannels((prev) => {
      const s = new Set(prev);
      for (const c of filteredRewardChannels) s.delete(c.id);
      return Array.from(s);
    });
  }, [filteredRewardChannels]);

  const revertRewardChannels = useCallback(() => {
    setRewardChannels(rewardChannelsSaved);
    toast.info('변경 사항을 되돌렸습니다.', { durationMs: 2000 });
  }, [rewardChannelsSaved, toast]);

  const saveRewardChannels = useCallback(async (): Promise<boolean> => {
    if (!rewardDirty) return true;
    setRewardSaving(true);
    try {
      const res = await fetch('/api/admin/reward-channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabledChannelIds: rewardChannels })
      });
      const body = (await res.json().catch(() => null)) as { error?: string; enabledChannelIds?: string[] } | null;
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      const saved = body?.enabledChannelIds ?? rewardChannels;
      setRewardChannels(saved);
      setRewardChannelsSaved(saved);
      toast.success('보상 채널 화이트리스트를 저장했습니다.');
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '보상 채널 저장에 실패했습니다.');
      return false;
    } finally {
      setRewardSaving(false);
    }
  }, [rewardChannels, rewardDirty, toast]);

  const parsedBullishScenarioDraft = useMemo(
    () => parseScenarioLines(bullishScenarioDraft),
    [bullishScenarioDraft]
  );
  const parsedBearishScenarioDraft = useMemo(
    () => parseScenarioLines(bearishScenarioDraft),
    [bearishScenarioDraft]
  );

  const scenarioDraftDirty = useMemo(() => {
    if (!cfg) return false;
    const baseBullish = normalizeScenarioList(cfg.stock_news_bullish_scenarios, DEFAULT_BULLISH_SCENARIOS);
    const baseBearish = normalizeScenarioList(cfg.stock_news_bearish_scenarios, DEFAULT_BEARISH_SCENARIOS);
    return !isSameStringList(baseBullish, parsedBullishScenarioDraft) || !isSameStringList(baseBearish, parsedBearishScenarioDraft);
  }, [cfg, parsedBearishScenarioDraft, parsedBullishScenarioDraft]);

  const generalConfigDirty = useMemo(
    () => hasConfigChangesForKeys(cfg, savedCfg, GENERAL_DIRTY_KEYS),
    [cfg, savedCfg]
  );
  const stockConfigDirty = useMemo(
    () => hasConfigChangesForKeys(cfg, savedCfg, STOCK_DIRTY_KEYS) || scenarioDraftDirty,
    [cfg, savedCfg, scenarioDraftDirty]
  );
  const economyConfigDirty = useMemo(
    () => hasConfigChangesForKeys(cfg, savedCfg, ECONOMY_DIRTY_KEYS),
    [cfg, savedCfg]
  );
  const configDirty = generalConfigDirty || stockConfigDirty || economyConfigDirty;

  const dirtySections = useMemo(() => {
    const sections: string[] = [];
    if (generalConfigDirty) sections.push('기본 설정');
    if (stockConfigDirty) sections.push('주식 설정');
    if (economyConfigDirty) sections.push('보상/경제 설정');
    if (rewardDirty) sections.push('보상 채널');
    return sections;
  }, [economyConfigDirty, generalConfigDirty, rewardDirty, stockConfigDirty]);

  const hasUnsavedChanges = dirtySections.length > 0;

  const saveAllChanges = useCallback(async () => {
    if (saving || rewardSaving) return;
    if (!hasUnsavedChanges) return;

    let ok = true;
    if (configDirty) ok = (await saveConfig()) && ok;
    if (rewardDirty) ok = (await saveRewardChannels()) && ok;

    if (ok) {
      toast.success('변경사항을 모두 저장했습니다.');
    }
  }, [configDirty, hasUnsavedChanges, rewardDirty, rewardSaving, saveConfig, saveRewardChannels, saving, toast]);

  const resetAllChanges = useCallback(() => {
    if (!savedCfg) return;
    const restored = cloneConfigSnapshot(savedCfg);
    setCfg(restored);
    setBullishScenarioDraft(formatScenarioLines(restored.stock_news_bullish_scenarios));
    setBearishScenarioDraft(formatScenarioLines(restored.stock_news_bearish_scenarios));
    setRewardChannels([...rewardChannelsSaved]);
    toast.info('저장되지 않은 변경사항을 되돌렸습니다.', { durationMs: 2200 });
  }, [rewardChannelsSaved, savedCfg, toast]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  const tunaEnergySummary = useMemo(() => {
    const discountCost = 3;
    const ss = Math.max(0, cfg?.duplicate_ss_tuna_energy ?? 0);
    const sss = Math.max(0, cfg?.duplicate_sss_tuna_energy ?? 0);

    return {
      discountCost,
      ssOnlyRuns: ss > 0 ? Math.ceil(discountCost / ss) : null,
      sssOnlyRuns: sss > 0 ? Math.ceil(discountCost / sss) : null,
      mixedHint:
        ss === 0 && sss === 0
          ? '현재는 강화 기운이 지급되지 않습니다.'
          : sss > ss
            ? 'SSS 중복 가치가 더 커서 상위 중복 보상이 빠르게 체감됩니다.'
            : sss === ss
              ? 'SS/SSS 중복 보상이 동일합니다. 등급 차이를 더 주려면 SSS를 높여보세요.'
              : 'SS 보상 대비 SSS 보상이 낮습니다. 보통 SSS를 더 높게 설정하는 편이 자연스럽습니다.'
    };
  }, [cfg?.duplicate_ss_tuna_energy, cfg?.duplicate_sss_tuna_energy]);

  const applyTunaEnergyPreset = useCallback(
    (preset: (typeof GACHA_TUNA_ENERGY_PRESETS)[number]) => {
      setCfg((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          duplicate_ss_tuna_energy: preset.ss,
          duplicate_sss_tuna_energy: preset.sss
        };
      });
      toast.info(`${preset.label} 프리셋을 적용했습니다.`, { durationMs: 1800 });
    },
    [toast]
  );

  const syncSssToDouble = useCallback(() => {
    setCfg((prev) => {
      if (!prev) return prev;
      const nextSss = Math.max(0, prev.duplicate_ss_tuna_energy * 2);
      return {
        ...prev,
        duplicate_sss_tuna_energy: nextSss
      };
    });
    toast.info('SSS 값을 SS의 2배로 맞췄습니다.', { durationMs: 1800 });
  }, [toast]);

  const startCrop = useCallback((key: AssetKey, file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    if (file.type === 'image/gif') {
      toast.error('GIF 이미지는 현재 자르기를 지원하지 않습니다. PNG/JPG/WebP 파일을 사용해 주세요.');
      return;
    }
    const srcUrl = URL.createObjectURL(file);
    setCrop({ key, srcUrl });
  }, [toast]);

  const stageUpload = useCallback(
    async (key: AssetKey, file: File) => {
      setAssetBusy({ key, op: 'stage' });
      try {
        const prev = key === 'banner' ? stagedBanner : stagedIcon;
        if (prev?.stagedPath) {
          await fetch(`/api/admin/assets/stage?path=${encodeURIComponent(prev.stagedPath)}`, { method: 'DELETE' }).catch(() => null);
        }

        const form = new FormData();
        form.set('key', key);
        form.set('file', file);
        const res = await fetch('/api/admin/assets/stage', { method: 'POST', body: form });
        const body = (await res.json().catch(() => null)) as
          | { ok?: boolean; stagedPath?: string; publicUrl?: string; error?: string }
          | null;
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        if (!body?.stagedPath || !body.publicUrl) throw new Error('Upload failed');

        const next = { stagedPath: body.stagedPath, publicUrl: body.publicUrl };
        if (key === 'banner') setStagedBanner(next);
        else setStagedIcon(next);
        toast.success('임시 업로드가 완료되었습니다. "적용"을 눌러야 반영됩니다.', { durationMs: 3500 });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '업로드에 실패했습니다.');
      } finally {
        setAssetBusy(null);
      }
    },
    [stagedBanner, stagedIcon, toast]
  );

  const cancelStage = useCallback(
    async (key: AssetKey) => {
      const staged = key === 'banner' ? stagedBanner : stagedIcon;
      if (!staged?.stagedPath) return;

      setAssetBusy({ key, op: 'cancel' });
      try {
        const res = await fetch(`/api/admin/assets/stage?path=${encodeURIComponent(staged.stagedPath)}`, { method: 'DELETE' });
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        if (key === 'banner') setStagedBanner(null);
        else setStagedIcon(null);
        toast.info('취소했습니다.', { durationMs: 2000 });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '취소에 실패했습니다.');
      } finally {
        setAssetBusy(null);
      }
    },
    [stagedBanner, stagedIcon, toast]
  );

  const commitStage = useCallback(
    async (key: AssetKey) => {
      const staged = key === 'banner' ? stagedBanner : stagedIcon;
      if (!staged?.stagedPath) return;

      setAssetBusy({ key, op: 'commit' });
      try {
        const res = await fetch('/api/admin/assets/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, stagedPath: staged.stagedPath })
        });
        const body = (await res.json().catch(() => null)) as { publicUrl?: string; error?: string } | null;
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        if (!body?.publicUrl) throw new Error('Commit failed');

        setCfg((prev) => {
          if (!prev) return prev;
          return key === 'banner'
            ? { ...prev, banner_image_url: body.publicUrl }
            : { ...prev, icon_image_url: body.publicUrl };
        });

        if (key === 'banner') setStagedBanner(null);
        else setStagedIcon(null);

        toast.success('적용했습니다.');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '적용에 실패했습니다.');
      } finally {
        setAssetBusy(null);
      }
    },
    [stagedBanner, stagedIcon, toast]
  );

  if (!cfg) {
    return (
      <main className="p-6">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-3xl font-semibold tracking-tight font-bangul">설정</h1>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl btn-soft px-3 py-2 text-xs font-semibold"
              onClick={() => router.back()}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
              <span>이전 페이지로 돌아가기</span>
            </button>
          </div>
          {loadError ? (
            <div className="mt-6 max-w-2xl rounded-3xl card-glass p-6">
              <div className="text-sm font-semibold">불러오기 실패</div>
              <div className="mt-2 text-xs muted break-words">{loadError}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-2xl btn-bangul px-4 py-3 text-sm font-semibold"
                  onClick={() =>
                    void loadAll().catch((e) => {
                      const msg = e instanceof Error ? e.message : '설정을 불러오지 못했습니다.';
                      setLoadError(msg);
                      toast.error('설정을 불러오지 못했습니다.');
                    })
                  }
                >
                  다시 시도
                </button>
                <Link className="rounded-2xl btn-soft px-4 py-3 text-sm font-semibold" href="/">
                  홈으로
                </Link>
              </div>
              <div className="mt-4 text-xs muted">
                DB를 초기화하셨다면 `supabase/bootstrap_nyang.sql`을 실행하고, Supabase API 설정의 Exposed schemas에 `nyang`를 추가해 주세요.
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm muted">불러오는 중…</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="p-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight font-bangul">설정</h1>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl btn-soft px-3 py-2 text-xs font-semibold"
            onClick={() => router.back()}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
            <span>이전 페이지로 돌아가기</span>
          </button>
        </div>

        <div className="mt-4 inline-flex flex-wrap rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] p-1 text-sm">
          <button
            type="button"
            className={`rounded-xl px-3 py-2 transition ${
              activeTab === 'general'
                ? 'bg-[color:var(--card)] text-[color:var(--fg)] shadow-[0_8px_20px_rgba(0,0,0,0.12)]'
                : 'text-[color:var(--muted)] hover:text-[color:var(--fg)]'
            }`}
            onClick={() => setActiveTab('general')}
          >
            기본
          </button>
          <button
            type="button"
            className={`rounded-xl px-3 py-2 transition ${
              activeTab === 'maintenance'
                ? 'bg-[color:var(--card)] text-[color:var(--fg)] shadow-[0_8px_20px_rgba(0,0,0,0.12)]'
                : 'text-[color:var(--muted)] hover:text-[color:var(--fg)]'
            }`}
            onClick={() => setActiveTab('maintenance')}
          >
            점검
          </button>
          <button
            type="button"
            className={`rounded-xl px-3 py-2 transition ${
              activeTab === 'stock'
                ? 'bg-[color:var(--card)] text-[color:var(--fg)] shadow-[0_8px_20px_rgba(0,0,0,0.12)]'
                : 'text-[color:var(--muted)] hover:text-[color:var(--fg)]'
            }`}
            onClick={() => setActiveTab('stock')}
          >
            주식
          </button>
          <button
            type="button"
            className={`rounded-xl px-3 py-2 transition ${
              activeTab === 'economy'
                ? 'bg-[color:var(--card)] text-[color:var(--fg)] shadow-[0_8px_20px_rgba(0,0,0,0.12)]'
                : 'text-[color:var(--muted)] hover:text-[color:var(--fg)]'
            }`}
            onClick={() => setActiveTab('economy')}
          >
            보상/경제
          </button>
        </div>

        {crop ? (
          <CropModal
            title={crop.key === 'banner' ? '배너 이미지 자르기' : '아이콘 이미지 자르기'}
            src={crop.srcUrl}
            aspect={crop.key === 'banner' ? 1600 / 600 : 1}
            output={
              crop.key === 'banner'
                ? { width: 1600, height: 600, fileName: 'banner.png' }
                : { width: 512, height: 512, fileName: 'icon.png' }
            }
            busy={assetBusy?.key === crop.key && assetBusy.op === 'stage'}
            onClose={() => setCrop(null)}
            onConfirm={(file) => {
              setCrop(null);
              void stageUpload(crop.key, file);
            }}
          />
        ) : null}

        <section className={`${activeTab === 'general' ? '' : 'hidden '}mt-6 max-w-2xl rounded-3xl card-glass p-6`}>
          <h2 className="text-lg font-semibold">사이트 이미지</h2>
          <p className="mt-2 text-xs muted">배너/아이콘을 업로드하여 적용할 수 있습니다. (적용 전에는 임시 업로드 상태입니다.)</p>

          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) startCrop('banner', file);
              e.currentTarget.value = '';
            }}
          />
          <input
            ref={iconInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) startCrop('icon', file);
              e.currentTarget.value = '';
            }}
          />

          <div className="mt-4 grid gap-5">
            <div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">배너</div>
                  <div className="mt-1 text-xs muted-2">권장: 1600x600</div>
                </div>
                <button
                  type="button"
                  className="rounded-xl btn-soft px-3 py-2 text-xs"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={!!assetBusy}
                >
                  새 이미지
                </button>
              </div>
              <div
                className="relative mt-3 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-black/20"
                style={{ aspectRatio: '8 / 3' }}
              >
                <NextImage
                  src={stagedBanner?.publicUrl ?? cfg.banner_image_url ?? '/banner.png'}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 672px"
                  className="object-cover"
                />
              </div>
              {stagedBanner ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-2xl btn-bangul px-4 py-2 text-xs font-semibold disabled:opacity-60"
                    onClick={() => void commitStage('banner')}
                    disabled={assetBusy?.key === 'banner'}
                  >
                    {assetBusy?.key === 'banner' && assetBusy.op === 'commit' ? '적용 중…' : '적용'}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl btn-soft px-3 py-2 text-xs disabled:opacity-60"
                    onClick={() => void cancelStage('banner')}
                    disabled={assetBusy?.key === 'banner'}
                  >
                    {assetBusy?.key === 'banner' && assetBusy.op === 'cancel' ? '취소 중…' : '취소'}
                  </button>
                  <span className="text-xs muted">임시 업로드 상태입니다.</span>
                </div>
              ) : null}
            </div>

            <div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">아이콘</div>
                  <div className="mt-1 text-xs muted-2">권장: 512x512</div>
                </div>
                <button
                  type="button"
                  className="rounded-xl btn-soft px-3 py-2 text-xs"
                  onClick={() => iconInputRef.current?.click()}
                  disabled={!!assetBusy}
                >
                  새 이미지
                </button>
              </div>
              <div className="mt-3 flex items-center gap-4">
                <div className="h-16 w-16 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-black/20">
                  <NextImage
                    src={stagedIcon?.publicUrl ?? cfg.icon_image_url ?? '/icon.jpg'}
                    alt=""
                    width={64}
                    height={64}
                    className="h-full w-full object-cover"
                  />
                </div>
              <div className="text-xs muted">내비바/메타데이터에 반영됩니다.</div>
              </div>
              {stagedIcon ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-2xl btn-bangul px-4 py-2 text-xs font-semibold disabled:opacity-60"
                    onClick={() => void commitStage('icon')}
                    disabled={assetBusy?.key === 'icon'}
                  >
                    {assetBusy?.key === 'icon' && assetBusy.op === 'commit' ? '적용 중…' : '적용'}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl btn-soft px-3 py-2 text-xs disabled:opacity-60"
                    onClick={() => void cancelStage('icon')}
                    disabled={assetBusy?.key === 'icon'}
                  >
                    {assetBusy?.key === 'icon' && assetBusy.op === 'cancel' ? '취소 중…' : '취소'}
                  </button>
                  <span className="text-xs muted">임시 업로드 상태입니다.</span>
                </div>
              ) : null}
            </div>
          </div>
        </section>

      <section className={`${activeTab === 'general' ? '' : 'hidden '}mt-8 max-w-2xl rounded-3xl card-glass p-6`}>
        <h2 className="text-lg font-semibold">서버 소개</h2>
        <p className="mt-2 text-xs muted">메인 페이지 배너 아래에 표시됩니다.</p>
        <textarea
          className="mt-3 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)]"
          rows={10}
          value={cfg.server_intro ?? ''}
          onChange={(e) => setCfg({ ...cfg, server_intro: e.target.value })}
          placeholder="서버 소개를 입력해 주세요"
        />
        <div className="mt-4 rounded-2xl border border-[color:var(--border)] bg-white/40 p-4">
          <div className="text-xs font-semibold">미리보기</div>
          {cfg.server_intro ? (
            <div className="mt-2">
              <MarkdownPreview content={cfg.server_intro} />
            </div>
          ) : (
            <div className="mt-2 text-sm muted">—</div>
          )}
        </div>
      </section>

      <section className={`${activeTab === 'maintenance' ? '' : 'hidden '}mt-6 max-w-2xl rounded-3xl card-glass p-6`}>
        <h2 className="text-lg font-semibold">점검 모드</h2>
        <p className="mt-2 text-xs muted">관리자 외 사용자에게 지정한 웹 경로/봇 명령어만 선택적으로 점검 잠금을 걸 수 있습니다.</p>

        <label className="mt-4 flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={cfg.maintenance_mode_enabled}
            onChange={(e) => setCfg({ ...cfg, maintenance_mode_enabled: e.target.checked })}
          />
          점검 모드 활성화
        </label>

        <label className="mt-4 block text-sm muted">점검 사유</label>
        <textarea
          className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)]"
          rows={4}
          value={cfg.maintenance_mode_reason ?? ''}
          onChange={(e) => setCfg({ ...cfg, maintenance_mode_reason: e.target.value || null })}
          placeholder="예: 경제 데이터 정합성 점검 및 거래 안정화 작업"
        />

        <label className="mt-4 block text-sm muted">예상 종료 시각</label>
        <input
          type="datetime-local"
          className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
          value={toDateTimeLocalInput(cfg.maintenance_mode_until)}
          onChange={(e) => setCfg({ ...cfg, maintenance_mode_until: fromDateTimeLocalInput(e.target.value) })}
        />

        <label className="mt-4 block text-sm muted">웹 점검 대상 경로 (한 줄에 하나)</label>
        <textarea
          className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm font-mono text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)]"
          rows={4}
          value={formatLineList(cfg.maintenance_web_target_paths)}
          onChange={(e) =>
            setCfg({
              ...cfg,
              maintenance_web_target_paths: normalizeMaintenancePathList(parseLineList(e.target.value))
            })
          }
          placeholder={['/stock', '/draw', '/music/*'].join('\n')}
        />
        <p className="mt-1 text-xs muted">비워두면 웹 전체 잠금입니다. `*`를 붙이면 하위 경로까지 매칭합니다.</p>

        <label className="mt-4 block text-sm muted">봇 점검 대상 명령어 (한 줄에 하나)</label>
        <textarea
          className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm font-mono text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)]"
          rows={4}
          value={formatLineList(cfg.maintenance_bot_target_commands)}
          onChange={(e) =>
            setCfg({
              ...cfg,
              maintenance_bot_target_commands: normalizeMaintenanceCommandList(parseLineList(e.target.value))
            })
          }
          placeholder={['stock', 'draw'].join('\n')}
        />
        <p className="mt-1 text-xs muted">비워두면 봇 인터랙션 전체 잠금입니다.</p>

        <div className="mt-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/70 p-3 text-xs text-[color:var(--fg)]">
          <div className="font-semibold">미리보기</div>
          <div className="mt-1">
            사유: {cfg.maintenance_mode_reason?.trim() ? cfg.maintenance_mode_reason.trim() : '(미입력)'}
          </div>
          <div className="mt-1">
            종료: {cfg.maintenance_mode_until
              ? new Date(cfg.maintenance_mode_until).toLocaleString('ko-KR', { hour12: false })
              : '미정'}
          </div>
          <div className="mt-1">웹 대상: {cfg.maintenance_web_target_paths.length > 0 ? cfg.maintenance_web_target_paths.join(', ') : '전체'}</div>
          <div className="mt-1">봇 대상: {cfg.maintenance_bot_target_commands.length > 0 ? cfg.maintenance_bot_target_commands.join(', ') : '전체'}</div>
          {cfg.maintenance_mode_until && Number.isFinite(Date.parse(cfg.maintenance_mode_until)) ? (
            <div className="mt-1 muted">
              봇 표시용: {'<t:'}
              {Math.floor(Date.parse(cfg.maintenance_mode_until) / 1000)}
              {':F>'} {'(<t:'}
              {Math.floor(Date.parse(cfg.maintenance_mode_until) / 1000)}
              {':R>)'}
            </div>
          ) : null}
        </div>
      </section>

          <section className={`${activeTab === 'stock' ? '' : 'hidden '}mt-6 max-w-2xl rounded-3xl card-glass p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">주식 뉴스</h2>
            <p className="mt-1 text-xs muted">자동 기사 전송 채널과 생성 주기를 설정합니다.</p>
          </div>
          <button
            type="button"
            className="rounded-2xl btn-bangul px-4 py-2 text-xs font-semibold disabled:opacity-60"
            disabled={newsTriggering || !cfg.stock_news_enabled || !cfg.stock_news_channel_id}
            onClick={() => void triggerStockNewsNow()}
          >
            {newsTriggering ? '요청 중…' : '기사 지금 생성'}
          </button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 rounded-2xl border border-[color:var(--line)] bg-[color:var(--chip)]/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">기사 조작 박스</h3>
                <p className="mt-1 text-xs muted">감정/티어/시나리오를 강제로 지정해서 1회성 기사를 생성합니다.</p>
              </div>
              <button
                type="button"
                className="rounded-2xl btn-bangul px-4 py-2 text-xs font-semibold disabled:opacity-60"
                disabled={newsTriggering || !cfg.stock_news_enabled || !cfg.stock_news_channel_id}
                onClick={() => void triggerForcedStockNews()}
              >
                {newsTriggering ? '요청 중…' : '조작 기사 생성'}
              </button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="text-sm">
                <CustomSelect
                  label="강제 감정"
                  value={forcedNewsSentiment}
                  options={stockNewsForceSentimentOptions}
                  onChange={(value) => {
                    const next: StockNewsForceSentimentOption =
                      value === 'bullish' || value === 'bearish' || value === 'neutral' ? value : 'auto';
                    setForcedNewsSentiment(next);
                  }}
                />
              </div>
              <div className="text-sm">
                <CustomSelect
                  label="강제 티어"
                  value={forcedNewsTier}
                  options={stockNewsForceTierOptions}
                  onChange={(value) => {
                    const next: StockNewsForceTierOption =
                      value === 'general' || value === 'rare' || value === 'shock' ? value : 'auto';
                    setForcedNewsTier(next);
                  }}
                />
              </div>
            </div>

            <label className="mt-3 block text-sm">
              강제 시나리오 (선택)
              <textarea
                className="mt-1 min-h-[96px] w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)]"
                value={forcedNewsScenario}
                onChange={(e) => setForcedNewsScenario(e.target.value.slice(0, MAX_FORCE_SCENARIO_LENGTH))}
                placeholder="예: 공급망 루머가 퍼지며 투자 심리가 급격히 위축"
              />
            </label>
            <div className="mt-2 text-xs muted-2">{forcedNewsScenario.length}/{MAX_FORCE_SCENARIO_LENGTH}</div>
          </div>

          <label className="text-sm sm:col-span-2">
            <span className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={cfg.stock_news_enabled}
                onChange={(e) => setCfg({ ...cfg, stock_news_enabled: e.target.checked })}
              />
              주식 뉴스 자동 전송 활성화
            </span>
          </label>

          <div className="text-sm sm:col-span-2">
            <CustomSelect
              label="전송 채널"
              value={cfg.stock_news_channel_id ?? ''}
              options={stockNewsChannelOptions}
              onChange={(value) => setCfg({ ...cfg, stock_news_channel_id: value || null })}
            />
          </div>

          <div className="text-sm">
            <CustomSelect
              label="스케줄 모드"
              value={cfg.stock_news_schedule_mode}
              options={stockNewsScheduleOptions}
              onChange={(value) =>
                setCfg({
                  ...cfg,
                  stock_news_schedule_mode: value === 'daily_random' ? 'daily_random' : 'interval'
                })
              }
            />
          </div>

          <label className="text-sm">
            반복 간격(분)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)] disabled:opacity-60"
              type="number"
              min={5}
              max={1440}
              value={cfg.stock_news_interval_minutes}
              disabled={cfg.stock_news_schedule_mode !== 'interval'}
              onChange={(e) => setCfg({ ...cfg, stock_news_interval_minutes: Number(e.target.value) })}
            />
          </label>

          <label className="text-sm">
            루머 지속시간(분)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={5}
              max={360}
              value={cfg.stock_news_signal_duration_rumor_minutes}
              onChange={(e) => setCfg({ ...cfg, stock_news_signal_duration_rumor_minutes: Number(e.target.value) })}
            />
          </label>

          <label className="text-sm">
            혼재 지속시간(분)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={5}
              max={360}
              value={cfg.stock_news_signal_duration_mixed_minutes}
              onChange={(e) => setCfg({ ...cfg, stock_news_signal_duration_mixed_minutes: Number(e.target.value) })}
            />
          </label>

          <label className="text-sm">
            확정 지속시간(분)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={5}
              max={360}
              value={cfg.stock_news_signal_duration_confirmed_minutes}
              onChange={(e) => setCfg({ ...cfg, stock_news_signal_duration_confirmed_minutes: Number(e.target.value) })}
            />
          </label>

          <label className="text-sm">
            반전 카드 지속시간(분)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={5}
              max={180}
              value={cfg.stock_news_signal_duration_reversal_minutes}
              onChange={(e) => setCfg({ ...cfg, stock_news_signal_duration_reversal_minutes: Number(e.target.value) })}
            />
          </label>

          <label className="text-sm">
            지속시간 상한(분)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={5}
              max={720}
              value={cfg.stock_news_signal_duration_max_minutes}
              onChange={(e) => setCfg({ ...cfg, stock_news_signal_duration_max_minutes: Number(e.target.value) })}
            />
          </label>

          <label className="text-sm">
            랜덤 시작 시(0~23)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)] disabled:opacity-60"
              type="number"
              min={0}
              max={23}
              value={cfg.stock_news_daily_window_start_hour}
              disabled={cfg.stock_news_schedule_mode !== 'daily_random'}
              onChange={(e) => setCfg({ ...cfg, stock_news_daily_window_start_hour: Number(e.target.value) })}
            />
          </label>

          <label className="text-sm">
            랜덤 종료 시(0~23)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)] disabled:opacity-60"
              type="number"
              min={0}
              max={23}
              value={cfg.stock_news_daily_window_end_hour}
              disabled={cfg.stock_news_schedule_mode !== 'daily_random'}
              onChange={(e) => setCfg({ ...cfg, stock_news_daily_window_end_hour: Number(e.target.value) })}
            />
          </label>

          <label className="text-sm">
            상승 최소 영향(bps)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={0}
              max={5000}
              value={cfg.stock_news_bullish_min_impact_bps}
              onChange={(e) => setCfg({ ...cfg, stock_news_bullish_min_impact_bps: Number(e.target.value) })}
            />
          </label>

          <label className="text-sm">
            상승 최대 영향(bps)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={0}
              max={5000}
              value={cfg.stock_news_bullish_max_impact_bps}
              onChange={(e) => setCfg({ ...cfg, stock_news_bullish_max_impact_bps: Number(e.target.value) })}
            />
          </label>

          <label className="text-sm">
            하락 최소 영향(bps)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={0}
              max={5000}
              value={cfg.stock_news_bearish_min_impact_bps}
              onChange={(e) => setCfg({ ...cfg, stock_news_bearish_min_impact_bps: Number(e.target.value) })}
            />
          </label>

          <label className="text-sm">
            하락 최대 영향(bps)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={0}
              max={5000}
              value={cfg.stock_news_bearish_max_impact_bps}
              onChange={(e) => setCfg({ ...cfg, stock_news_bearish_max_impact_bps: Number(e.target.value) })}
            />
          </label>

          <label className="text-sm sm:col-span-2">
            호재 시나리오 (줄바꿈으로 분리)
            <textarea
              className="mt-1 min-h-[140px] w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)]"
              value={bullishScenarioDraft}
              onChange={(e) => setBullishScenarioDraft(e.target.value)}
              placeholder="차세대 제품 쇼케이스 기대감 확산"
            />
            <div className="mt-2 flex items-center justify-between gap-2 text-xs muted-2">
              <span>{parseScenarioLines(bullishScenarioDraft).length}개</span>
              <button
                type="button"
                className="rounded-xl btn-soft px-2.5 py-1"
                onClick={() => {
                  const defaults = [...DEFAULT_BULLISH_SCENARIOS];
                  setCfg({ ...cfg, stock_news_bullish_scenarios: defaults });
                  setBullishScenarioDraft(formatScenarioLines(defaults));
                }}
              >
                기본값 복원
              </button>
            </div>
          </label>

          <label className="text-sm sm:col-span-2">
            악재 시나리오 (줄바꿈으로 분리)
            <textarea
              className="mt-1 min-h-[140px] w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)]"
              value={bearishScenarioDraft}
              onChange={(e) => setBearishScenarioDraft(e.target.value)}
              placeholder="생산 라인 점검 이슈 부각"
            />
            <div className="mt-2 flex items-center justify-between gap-2 text-xs muted-2">
              <span>{parseScenarioLines(bearishScenarioDraft).length}개</span>
              <button
                type="button"
                className="rounded-xl btn-soft px-2.5 py-1"
                onClick={() => {
                  const defaults = [...DEFAULT_BEARISH_SCENARIOS];
                  setCfg({ ...cfg, stock_news_bearish_scenarios: defaults });
                  setBearishScenarioDraft(formatScenarioLines(defaults));
                }}
              >
                기본값 복원
              </button>
            </div>
          </label>
        </div>

        <div className="mt-4 grid gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] p-3 text-xs muted sm:grid-cols-3">
          <div>
            <div className="muted-2">최근 전송</div>
            <div className="text-[color:var(--fg)]">
              {cfg.stock_news_last_sent_at ? new Date(cfg.stock_news_last_sent_at).toLocaleString('ko-KR', { hour12: false }) : '-'}
            </div>
          </div>
          <div>
            <div className="muted-2">다음 예정</div>
            <div className="text-[color:var(--fg)]">
              {cfg.stock_news_next_run_at ? new Date(cfg.stock_news_next_run_at).toLocaleString('ko-KR', { hour12: false }) : '-'}
            </div>
          </div>
          <div>
            <div className="muted-2">수동 요청 대기</div>
            <div className="text-[color:var(--fg)]">{cfg.stock_news_force_run_at ? '있음' : '없음'}</div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-[color:var(--line)] bg-[color:var(--chip)]/70 p-4">
          <h3 className="text-sm font-semibold">시장 메이커 설정</h3>
          <p className="mt-1 text-xs muted">자동매매 주기와 고래/새우/개미 수량을 설정합니다. 개미 쿨타임은 주기를 기준으로 자동 계산됩니다.</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              자동매매 주기(ms)
              <input
                className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
                type="number"
                min={5000}
                max={300000}
                value={cfg.stock_market_maker_interval_ms ?? ''}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  setCfg({
                    ...cfg,
                    stock_market_maker_interval_ms: raw.length === 0 ? null : Number(raw)
                  });
                }}
              />
              <p className="mt-1 text-xs muted-2">비우면 기본 주기(봇 동기화 주기)를 사용합니다. 개미 자동매수 쿨타임은 주기 x 4로 자동 적용됩니다.</p>
            </label>

            <label className="text-sm">
              고래 최대 매수(주)
              <input
                className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
                type="number"
                min={1}
                max={5000}
                value={cfg.stock_whale_max_buy_qty}
                onChange={(e) => setCfg({ ...cfg, stock_whale_max_buy_qty: Number(e.target.value) })}
              />
            </label>

            <label className="text-sm">
              고래 최대 매도(주)
              <input
                className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
                type="number"
                min={1}
                max={5000}
                value={cfg.stock_whale_max_sell_qty}
                onChange={(e) => setCfg({ ...cfg, stock_whale_max_sell_qty: Number(e.target.value) })}
              />
            </label>

            <label className="text-sm">
              새우 최대 매수(주)
              <input
                className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
                type="number"
                min={1}
                max={1000}
                value={cfg.stock_shrimp_max_buy_qty}
                onChange={(e) => setCfg({ ...cfg, stock_shrimp_max_buy_qty: Number(e.target.value) })}
              />
            </label>

            <label className="text-sm">
              새우 최대 매도(주)
              <input
                className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
                type="number"
                min={1}
                max={1000}
                value={cfg.stock_shrimp_max_sell_qty}
                onChange={(e) => setCfg({ ...cfg, stock_shrimp_max_sell_qty: Number(e.target.value) })}
              />
            </label>

            <label className="text-sm">
              개미 자동 매수(주)
              <input
                className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
                type="number"
                min={1}
                max={500}
                value={cfg.stock_ant_auto_buy_qty}
                onChange={(e) => setCfg({ ...cfg, stock_ant_auto_buy_qty: Number(e.target.value) })}
              />
            </label>

          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-[color:var(--line)] bg-[color:var(--chip)]/70 p-4">
          <h3 className="text-sm font-semibold">보유 수수료 설정</h3>
          <p className="mt-1 text-xs muted">장기 보유 포지션에 대한 일일 보유 수수료 정책을 조정합니다.</p>

          <label className="mt-3 inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cfg.stock_holding_fee_enabled}
              onChange={(e) => setCfg({ ...cfg, stock_holding_fee_enabled: e.target.checked })}
            />
            보유 수수료 적용
          </label>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              일일 수수료(bps)
              <input
                className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
                type="number"
                min={1}
                max={1000}
                value={cfg.stock_holding_fee_daily_bps}
                onChange={(e) => setCfg({ ...cfg, stock_holding_fee_daily_bps: Number(e.target.value) })}
              />
              <p className="mt-1 text-xs muted-2">예: 8 = 0.08%</p>
            </label>

            <label className="text-sm">
              일일 수수료 상한(bps)
              <input
                className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
                type="number"
                min={1}
                max={2000}
                value={cfg.stock_holding_fee_daily_cap_bps}
                onChange={(e) => setCfg({ ...cfg, stock_holding_fee_daily_cap_bps: Number(e.target.value) })}
              />
              <p className="mt-1 text-xs muted-2">일일 수수료보다 작게 저장되면 자동으로 맞춰집니다.</p>
            </label>

            <label className="text-sm sm:col-span-2">
              기준 타임존
              <input
                className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
                type="text"
                value={cfg.stock_holding_fee_timezone}
                onChange={(e) => setCfg({ ...cfg, stock_holding_fee_timezone: e.target.value })}
                placeholder="Asia/Seoul"
              />
            </label>
          </div>

          <p className="mt-3 text-xs muted">
            마지막 적용일: {cfg.stock_holding_fee_last_applied_on ? cfg.stock_holding_fee_last_applied_on : '아직 없음'}
          </p>
        </div>
      </section>

      <section className={`${activeTab === 'general' ? '' : 'hidden '}mt-6 max-w-2xl rounded-3xl card-glass p-6`}>
        <h2 className="text-lg font-semibold">입장 메시지</h2>
        <label className="mt-3 block text-sm muted">채널</label>
        <div className="relative mt-1">
          <select
            className="w-full appearance-none rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 pr-10 text-sm text-[color:var(--fg)]"
            value={cfg.join_message_channel_id ?? ''}
            onChange={(e) => setCfg({ ...cfg, join_message_channel_id: e.target.value || null })}
          >
            <option value="">(사용 안 함)</option>
            {textChannels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted-2)]"
            aria-hidden="true"
            strokeWidth={2}
          />
        </div>
        <label className="mt-3 block text-sm muted">템플릿</label>
        <textarea
          className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)]"
          rows={4}
          value={cfg.join_message_template ?? ''}
          onChange={(e) => setCfg({ ...cfg, join_message_template: e.target.value || null })}
          placeholder="{user}님, 방울냥 서버에 오신 걸 환영해!"
        />
        <p className="mt-2 text-xs muted-2">사용 가능: {'{user}'} {'{username}'} {'{server}'}</p>
      </section>

      <section className={`${activeTab === 'general' ? '' : 'hidden '}mt-6 max-w-2xl rounded-3xl card-glass p-6`}>
        <h2 className="text-lg font-semibold">음성방 자동 생성</h2>
        <p className="mt-2 text-xs muted">
          지정된 트리거 음성채널에 유저가 입장하면, 저장된 개인 설정으로 새 통화방을 자동 생성해 이동시킵니다.
        </p>

        <label className="mt-3 block text-sm muted">음성방 생성 트리거 채널</label>
        <div className="relative mt-1">
          <select
            className="w-full appearance-none rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 pr-10 text-sm text-[color:var(--fg)]"
            value={cfg.voice_interface_trigger_channel_id ?? ''}
            onChange={(e) => setCfg({ ...cfg, voice_interface_trigger_channel_id: e.target.value || null })}
          >
            <option value="">(사용 안 함)</option>
            {voiceChannels.map((c) => {
              const parent = c.parent_id ? categoryNameById.get(c.parent_id) : null;
              return (
                <option key={c.id} value={c.id}>
                  {parent ? `${parent} / ` : ''}{c.name}
                </option>
              );
            })}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted-2)]"
            aria-hidden="true"
            strokeWidth={2}
          />
        </div>

        <label className="mt-3 block text-sm muted">생성 카테고리</label>
        <div className="relative mt-1">
          <select
            className="w-full appearance-none rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 pr-10 text-sm text-[color:var(--fg)]"
            value={cfg.voice_interface_category_id ?? ''}
            onChange={(e) => setCfg({ ...cfg, voice_interface_category_id: e.target.value || null })}
          >
            <option value="">(트리거 채널 카테고리 사용)</option>
            {categoryChannels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted-2)]"
            aria-hidden="true"
            strokeWidth={2}
          />
        </div>
      </section>

      <section className={`${activeTab === 'economy' ? '' : 'hidden '}mt-6 max-w-2xl rounded-3xl card-glass p-6`}>
        <h2 className="text-lg font-semibold">채팅 보상</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            주기당 포인트
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              value={cfg.reward_points_per_interval}
              onChange={(e) => setCfg({ ...cfg, reward_points_per_interval: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            주기(초)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              value={cfg.reward_interval_seconds}
              onChange={(e) => setCfg({ ...cfg, reward_interval_seconds: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            일일 상한(비우면 무제한)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              value={cfg.reward_daily_cap_points ?? ''}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  reward_daily_cap_points: e.target.value === '' ? null : Number(e.target.value)
                })
              }
            />
          </label>
          <label className="text-sm">
            최소 글자 수
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              value={cfg.reward_min_message_length}
              onChange={(e) => setCfg({ ...cfg, reward_min_message_length: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            부스터 추가 포인트
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              value={cfg.booster_chat_bonus_points}
              onChange={(e) => setCfg({ ...cfg, booster_chat_bonus_points: Number(e.target.value) })}
            />
          </label>
        </div>
      </section>

      <section className={`${activeTab === 'economy' ? '' : 'hidden '}mt-6 max-w-2xl rounded-3xl card-glass p-6`}>
        <h2 className="text-lg font-semibold">음성 보상</h2>
        <p className="mt-2 text-xs muted">모든 음성 채널에 적용됩니다.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            주기당 포인트
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              value={cfg.voice_reward_points_per_interval}
              onChange={(e) => setCfg({ ...cfg, voice_reward_points_per_interval: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            주기(초)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              value={cfg.voice_reward_interval_seconds}
              onChange={(e) => setCfg({ ...cfg, voice_reward_interval_seconds: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            일일 상한(비우면 무제한)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              value={cfg.voice_reward_daily_cap_points ?? ''}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  voice_reward_daily_cap_points: e.target.value === '' ? null : Number(e.target.value)
                })
              }
            />
          </label>
          <label className="text-sm">
            부스터 추가 포인트
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              value={cfg.booster_voice_bonus_points}
              onChange={(e) => setCfg({ ...cfg, booster_voice_bonus_points: Number(e.target.value) })}
            />
          </label>
        </div>
      </section>

      <section className={`${activeTab === 'economy' ? '' : 'hidden '}mt-6 max-w-2xl rounded-3xl card-glass p-6`}>
        <h2 className="text-lg font-semibold">일일 보물상자 보상</h2>
        <p className="mt-2 text-xs muted">/daily 보상 확률과 포인트 범위를 설정합니다.</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            레전더리 확률(%)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={cfg.daily_chest_legendary_rate_pct}
              onChange={(e) => setCfg({ ...cfg, daily_chest_legendary_rate_pct: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            에픽 확률(%)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={cfg.daily_chest_epic_rate_pct}
              onChange={(e) => setCfg({ ...cfg, daily_chest_epic_rate_pct: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            레어 확률(%)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={cfg.daily_chest_rare_rate_pct}
              onChange={(e) => setCfg({ ...cfg, daily_chest_rare_rate_pct: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            아이템 드롭 확률(%)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={cfg.daily_chest_item_drop_rate_pct}
              onChange={(e) => setCfg({ ...cfg, daily_chest_item_drop_rate_pct: Number(e.target.value) })}
            />
          </label>
        </div>

        <p className="mt-2 text-xs muted-2">
          커먼 확률은 자동 계산됩니다: {Math.max(0, 100 - cfg.daily_chest_legendary_rate_pct - cfg.daily_chest_epic_rate_pct - cfg.daily_chest_rare_rate_pct).toFixed(1)}%
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            커먼 최소 포인트
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              value={cfg.daily_chest_common_min_points}
              onChange={(e) => setCfg({ ...cfg, daily_chest_common_min_points: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            커먼 최대 포인트
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              value={cfg.daily_chest_common_max_points}
              onChange={(e) => setCfg({ ...cfg, daily_chest_common_max_points: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            레어 최소 포인트
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              value={cfg.daily_chest_rare_min_points}
              onChange={(e) => setCfg({ ...cfg, daily_chest_rare_min_points: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            레어 최대 포인트
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              value={cfg.daily_chest_rare_max_points}
              onChange={(e) => setCfg({ ...cfg, daily_chest_rare_max_points: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            에픽 최소 포인트
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              value={cfg.daily_chest_epic_min_points}
              onChange={(e) => setCfg({ ...cfg, daily_chest_epic_min_points: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            에픽 최대 포인트
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              value={cfg.daily_chest_epic_max_points}
              onChange={(e) => setCfg({ ...cfg, daily_chest_epic_max_points: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            레전더리 최소 포인트
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              value={cfg.daily_chest_legendary_min_points}
              onChange={(e) => setCfg({ ...cfg, daily_chest_legendary_min_points: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            레전더리 최대 포인트
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              value={cfg.daily_chest_legendary_max_points}
              onChange={(e) => setCfg({ ...cfg, daily_chest_legendary_max_points: Number(e.target.value) })}
            />
          </label>
        </div>
      </section>

      <section className={`${activeTab === 'economy' ? '' : 'hidden '}mt-6 max-w-2xl rounded-3xl card-glass p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">가챠 기운 설정</h2>
            <p className="mt-2 text-xs muted">중복 SS/SSS에서 지급되는 강화 기운 수량입니다. 기운 {tunaEnergySummary.discountCost}개마다 강화 비용이 50% 할인됩니다.</p>
          </div>
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-xs">
            할인 1회 필요 기운: <span className="font-semibold">{tunaEnergySummary.discountCost}개</span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 rounded-2xl border border-[color:var(--line)] bg-[color:var(--chip)]/70 p-4 sm:grid-cols-2">
          <label className="text-sm">
            SS 중복 기운 지급량
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={0}
              value={cfg.duplicate_ss_tuna_energy}
              onChange={(e) => setCfg({ ...cfg, duplicate_ss_tuna_energy: Number(e.target.value) })}
            />
            <p className="mt-1 text-[11px] muted-2">중복 SS 1회당 지급되는 기운</p>
          </label>
          <label className="text-sm">
            SSS 중복 기운 지급량
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={0}
              value={cfg.duplicate_sss_tuna_energy}
              onChange={(e) => setCfg({ ...cfg, duplicate_sss_tuna_energy: Number(e.target.value) })}
            />
            <p className="mt-1 text-[11px] muted-2">중복 SSS 1회당 지급되는 기운</p>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {GACHA_TUNA_ENERGY_PRESETS.map((preset) => {
            const active = cfg.duplicate_ss_tuna_energy === preset.ss && cfg.duplicate_sss_tuna_energy === preset.sss;
            return (
              <button
                key={preset.key}
                type="button"
                className={`rounded-xl px-3 py-2 text-xs transition ${
                  active
                    ? 'border border-[color:var(--accent-pink)]/60 bg-[color:var(--accent-pink)]/15 text-[color:var(--fg)]'
                    : 'btn-soft'
                }`}
                onClick={() => applyTunaEnergyPreset(preset)}
              >
                <span className="font-semibold">{preset.label}</span>
                <span className="ml-1 muted-2">SS {preset.ss} / SSS {preset.sss}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="rounded-xl btn-soft px-3 py-2 text-xs"
            onClick={syncSssToDouble}
          >
            SSS = SS x2
          </button>
        </div>

        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2">
            <div className="muted-2">SS만으로 할인 1회</div>
            <div className="mt-1 font-semibold text-[color:var(--fg)]">
              {tunaEnergySummary.ssOnlyRuns ? `${tunaEnergySummary.ssOnlyRuns}회 중복` : '설정 안 됨'}
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2">
            <div className="muted-2">SSS만으로 할인 1회</div>
            <div className="mt-1 font-semibold text-[color:var(--fg)]">
              {tunaEnergySummary.sssOnlyRuns ? `${tunaEnergySummary.sssOnlyRuns}회 중복` : '설정 안 됨'}
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2">
            <div className="muted-2">운영 힌트</div>
            <div className="mt-1 text-[11px] text-[color:var(--fg)]">{tunaEnergySummary.mixedHint}</div>
          </div>
        </div>
      </section>

      <section className={`${activeTab === 'economy' ? '' : 'hidden '}mt-6 max-w-2xl rounded-3xl card-glass p-6`}>
        <h2 className="text-lg font-semibold">복권 설정</h2>
        <p className="mt-2 text-xs muted">
          /복권 확률, 티켓 가격, 등급별 보상, 쿨타임을 조절합니다. 꽝이 나오면 티켓 가격만큼 잭팟 풀에 누적되고, 잭팟 당첨 시 기본 잭팟 보상 +
          잭팟 풀 누적치가 지급됩니다.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            복권 가격(p)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={1}
              value={cfg.lottery_ticket_price}
              onChange={(e) => setCfg({ ...cfg, lottery_ticket_price: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            잭팟 기본 보상(p)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={0}
              value={cfg.lottery_jackpot_base_points}
              onChange={(e) => setCfg({ ...cfg, lottery_jackpot_base_points: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            골드 보상(p)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={0}
              value={cfg.lottery_gold_payout_points}
              onChange={(e) => setCfg({ ...cfg, lottery_gold_payout_points: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            실버 보상(p)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={0}
              value={cfg.lottery_silver_payout_points}
              onChange={(e) => setCfg({ ...cfg, lottery_silver_payout_points: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            브론즈 보상(p)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={0}
              value={cfg.lottery_bronze_payout_points}
              onChange={(e) => setCfg({ ...cfg, lottery_bronze_payout_points: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            현재 잭팟 풀(p)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={0}
              value={cfg.lottery_jackpot_pool_points}
              onChange={(e) => setCfg({ ...cfg, lottery_jackpot_pool_points: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            활동 잭팟 적립률(%)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={cfg.lottery_activity_jackpot_rate_pct}
              onChange={(e) => setCfg({ ...cfg, lottery_activity_jackpot_rate_pct: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            잭팟 확률(%)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={cfg.lottery_jackpot_rate_pct}
              onChange={(e) => setCfg({ ...cfg, lottery_jackpot_rate_pct: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            골드 확률(%)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={cfg.lottery_gold_rate_pct}
              onChange={(e) => setCfg({ ...cfg, lottery_gold_rate_pct: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            실버 확률(%)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={cfg.lottery_silver_rate_pct}
              onChange={(e) => setCfg({ ...cfg, lottery_silver_rate_pct: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            브론즈 확률(%)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={cfg.lottery_bronze_rate_pct}
              onChange={(e) => setCfg({ ...cfg, lottery_bronze_rate_pct: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            복권 쿨타임(초)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={0}
              value={cfg.lottery_ticket_cooldown_seconds}
              onChange={(e) => setCfg({ ...cfg, lottery_ticket_cooldown_seconds: Number(e.target.value) })}
            />
          </label>
        </div>

        <p className="mt-2 text-xs muted-2">
          꽝 확률은 자동 계산됩니다: {Math.max(0, 100 - cfg.lottery_jackpot_rate_pct - cfg.lottery_gold_rate_pct - cfg.lottery_silver_rate_pct - cfg.lottery_bronze_rate_pct).toFixed(1)}%
        </p>
      </section>

      <section className={`${activeTab === 'economy' ? '' : 'hidden '}mt-6 max-w-2xl rounded-3xl card-glass p-6`}>
        <h2 className="text-lg font-semibold">보상 채널(화이트리스트)</h2>
        <p className="mt-2 text-xs muted">선택된 채널에서만 채팅 보상이 적립됩니다.</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="text-sm">
            <span className="sr-only">채널 검색</span>
            <input
              className="w-[min(28rem,100%)] rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)]"
              value={rewardSearch}
              onChange={(e) => setRewardSearch(e.target.value)}
              placeholder="채널 이름/ID로 검색"
            />
          </label>
          <div className="text-xs muted">
            선택: {rewardChannels.length}개 / 전체: {textChannels.length}개
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="rounded-xl btn-soft px-3 py-2 text-xs" onClick={selectAllFiltered}>
            필터된 채널 모두 선택
          </button>
          <button type="button" className="rounded-xl btn-soft px-3 py-2 text-xs" onClick={clearFiltered}>
            필터된 채널 모두 해제
          </button>
          <button
            type="button"
            className="rounded-xl btn-soft px-3 py-2 text-xs disabled:opacity-60"
            onClick={revertRewardChannels}
            disabled={!rewardDirty || rewardSaving}
          >
            되돌리기
          </button>
          <button
            type="button"
            className="rounded-2xl btn-bangul px-4 py-2 text-xs font-semibold disabled:opacity-60"
            onClick={() => void saveRewardChannels()}
            disabled={!rewardDirty || rewardSaving}
          >
            {rewardSaving ? '저장 중…' : '저장'}
          </button>
        </div>

        <div className="mt-4 max-h-[360px] overflow-auto rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-2">
          <div className="grid gap-1">
            {filteredRewardChannels.map((c) => {
              const enabled = rewardChannelSet.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left transition ${
                    enabled
                      ? 'border-[color:var(--border)] bg-[color:var(--card)]'
                      : 'border-transparent bg-[color:var(--chip)]'
                  }`}
                  onClick={() => toggleRewardChannel(c.id)}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-[color:var(--fg)]">#{c.name}</div>
                    <div className="truncate text-[11px] muted-2">{c.id}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${enabled ? 'text-[color:var(--fg)]' : 'muted'}`}>{enabled ? '허용' : '미허용'}</span>
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-xl border ${
                        enabled
                          ? 'border-[color:var(--border)] bg-[color:var(--chip)]'
                          : 'border-[color:var(--border)] bg-transparent'
                      }`}
                      aria-hidden="true"
                    >
                      {enabled ? <Check className="h-4 w-4" strokeWidth={2.2} /> : null}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="sticky bottom-6 z-10 mt-10">
        <div className="ml-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 rounded-3xl border border-[color:var(--border)] bg-[color:var(--card)]/88 px-4 py-3 backdrop-blur shadow-[0_18px_46px_rgba(0,0,0,0.12)]">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[color:var(--fg)]">
              {hasUnsavedChanges ? '저장되지 않은 변경사항이 있습니다.' : '모든 변경사항이 저장되었습니다.'}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
              {hasUnsavedChanges ? (
                dirtySections.map((section) => (
                  <span
                    key={section}
                    className="rounded-full border border-[color:var(--border)] bg-[color:var(--chip)] px-2 py-0.5 text-[color:var(--fg)]"
                  >
                    {section}
                  </span>
                ))
              ) : (
                <span className="muted">현재 상태가 최신입니다.</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-xl btn-soft px-3 py-2 text-xs disabled:opacity-60"
              disabled={!hasUnsavedChanges || saving || rewardSaving}
              onClick={resetAllChanges}
            >
              전체 되돌리기
            </button>
            <button
              type="button"
              className="rounded-2xl btn-bangul px-5 py-3 text-sm font-semibold disabled:opacity-60"
              disabled={!hasUnsavedChanges || saving || rewardSaving}
              onClick={() => void saveAllChanges()}
            >
              {saving || rewardSaving ? '저장 중…' : '변경 저장'}
            </button>
          </div>
        </div>
      </div>
      </div>
    </main>
  );
}
