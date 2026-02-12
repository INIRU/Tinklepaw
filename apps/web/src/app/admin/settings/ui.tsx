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
  stock_news_daily_window_start_hour: number;
  stock_news_daily_window_end_hour: number;
  stock_news_min_impact_bps: number;
  stock_news_max_impact_bps: number;
  stock_news_bullish_scenarios: string[];
  stock_news_bearish_scenarios: string[];
  stock_news_last_sent_at?: string | null;
  stock_news_next_run_at?: string | null;
  stock_news_force_run_at?: string | null;
};

type SettingsTab = 'general' | 'stock' | 'economy';

type DiscordChannel = { id: string; name: string; type: number; parent_id?: string | null };

type AssetKey = 'banner' | 'icon';
type StagedAsset = { stagedPath: string; publicUrl: string };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

const MAX_SCENARIO_LINES = 64;

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [rewardChannels, setRewardChannels] = useState<string[]>([]); // draft
  const [rewardChannelsSaved, setRewardChannelsSaved] = useState<string[]>([]);
  const [rewardSearch, setRewardSearch] = useState('');
  const [rewardSaving, setRewardSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newsTriggering, setNewsTriggering] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

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
    setCfg({
      ...(cfgBody as AppConfig),
      join_message_template: cfgBody.join_message_template ?? null,
      join_message_channel_id: cfgBody.join_message_channel_id ?? null,
      voice_interface_trigger_channel_id: cfgBody.voice_interface_trigger_channel_id ?? null,
      voice_interface_category_id: cfgBody.voice_interface_category_id ?? null,
      stock_news_enabled: Boolean(cfgBody.stock_news_enabled ?? false),
      stock_news_channel_id: cfgBody.stock_news_channel_id ?? null,
      stock_news_schedule_mode: cfgBody.stock_news_schedule_mode === 'daily_random' ? 'daily_random' : 'interval',
      stock_news_interval_minutes: Number(cfgBody.stock_news_interval_minutes ?? 60),
      stock_news_daily_window_start_hour: Number(cfgBody.stock_news_daily_window_start_hour ?? 9),
      stock_news_daily_window_end_hour: Number(cfgBody.stock_news_daily_window_end_hour ?? 23),
      stock_news_min_impact_bps: Number(cfgBody.stock_news_min_impact_bps ?? 40),
      stock_news_max_impact_bps: Number(cfgBody.stock_news_max_impact_bps ?? 260),
      stock_news_bullish_scenarios: normalizeScenarioList(cfgBody.stock_news_bullish_scenarios, DEFAULT_BULLISH_SCENARIOS),
      stock_news_bearish_scenarios: normalizeScenarioList(cfgBody.stock_news_bearish_scenarios, DEFAULT_BEARISH_SCENARIOS),
      stock_news_last_sent_at: cfgBody.stock_news_last_sent_at ?? null,
      stock_news_next_run_at: cfgBody.stock_news_next_run_at ?? null,
      stock_news_force_run_at: cfgBody.stock_news_force_run_at ?? null,
      lottery_activity_jackpot_rate_pct: Number(cfgBody.lottery_activity_jackpot_rate_pct ?? 10),
    });
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

  const saveConfig = useCallback(async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setCfg((await res.json()) as AppConfig);
      toast.success('저장했습니다.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }, [cfg, toast]);

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

  const saveRewardChannels = useCallback(async () => {
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '보상 채널 저장에 실패했습니다.');
    } finally {
      setRewardSaving(false);
    }
  }, [rewardChannels, toast]);

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
            최소 영향(bps)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={0}
              max={5000}
              value={cfg.stock_news_min_impact_bps}
              onChange={(e) => setCfg({ ...cfg, stock_news_min_impact_bps: Number(e.target.value) })}
            />
          </label>

          <label className="text-sm">
            최대 영향(bps)
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={0}
              max={5000}
              value={cfg.stock_news_max_impact_bps}
              onChange={(e) => setCfg({ ...cfg, stock_news_max_impact_bps: Number(e.target.value) })}
            />
          </label>

          <label className="text-sm sm:col-span-2">
            호재 시나리오 (줄바꿈으로 분리)
            <textarea
              className="mt-1 min-h-[140px] w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)]"
              value={formatScenarioLines(cfg.stock_news_bullish_scenarios)}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  stock_news_bullish_scenarios: parseScenarioLines(e.target.value)
                })
              }
              placeholder="차세대 제품 쇼케이스 기대감 확산"
            />
            <div className="mt-2 flex items-center justify-between gap-2 text-xs muted-2">
              <span>{cfg.stock_news_bullish_scenarios.length}개</span>
              <button
                type="button"
                className="rounded-xl btn-soft px-2.5 py-1"
                onClick={() => setCfg({ ...cfg, stock_news_bullish_scenarios: [...DEFAULT_BULLISH_SCENARIOS] })}
              >
                기본값 복원
              </button>
            </div>
          </label>

          <label className="text-sm sm:col-span-2">
            악재 시나리오 (줄바꿈으로 분리)
            <textarea
              className="mt-1 min-h-[140px] w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)]"
              value={formatScenarioLines(cfg.stock_news_bearish_scenarios)}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  stock_news_bearish_scenarios: parseScenarioLines(e.target.value)
                })
              }
              placeholder="생산 라인 점검 이슈 부각"
            />
            <div className="mt-2 flex items-center justify-between gap-2 text-xs muted-2">
              <span>{cfg.stock_news_bearish_scenarios.length}개</span>
              <button
                type="button"
                className="rounded-xl btn-soft px-2.5 py-1"
                onClick={() => setCfg({ ...cfg, stock_news_bearish_scenarios: [...DEFAULT_BEARISH_SCENARIOS] })}
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
        <h2 className="text-lg font-semibold">참치캔의 기운 설정</h2>
        <p className="mt-2 text-xs muted">가챠 중복에서 SS/SSS 등급이 나올 때 지급할 강화 기운 수량입니다. 기운 3개를 소모하면 강화 비용이 50% 할인됩니다.</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            SS 중복 기운 지급량
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={0}
              value={cfg.duplicate_ss_tuna_energy}
              onChange={(e) => setCfg({ ...cfg, duplicate_ss_tuna_energy: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            SSS 중복 기운 지급량
            <input
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
              type="number"
              min={0}
              value={cfg.duplicate_sss_tuna_energy}
              onChange={(e) => setCfg({ ...cfg, duplicate_sss_tuna_energy: Number(e.target.value) })}
            />
          </label>
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

      <div className="sticky bottom-6 z-10 mt-10 flex justify-end">
        <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--card)]/80 backdrop-blur px-3 py-3 shadow-[0_18px_46px_rgba(0,0,0,0.12)]">
          <button
            type="button"
            className="rounded-2xl btn-bangul px-5 py-3 text-sm font-semibold disabled:opacity-60"
            disabled={saving}
            onClick={() => void saveConfig()}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
      </div>
    </main>
  );
}
