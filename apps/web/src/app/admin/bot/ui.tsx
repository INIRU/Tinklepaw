'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/toast/ToastProvider';
import { ChevronLeft, Bot, Check, ChevronDown } from 'lucide-react';

type BotConfig = {
  persona_prompt?: string | null;
  reward_emoji_enabled?: boolean;
  bot_sync_interval_ms?: number;
  gacha_embed_color?: string;
  gacha_embed_title?: string;
  gacha_embed_description?: string;
  gacha_processing_title?: string;
  gacha_processing_description?: string;
  gacha_result_title?: string;
  inventory_embed_title?: string;
  inventory_embed_color?: string;
  inventory_embed_description?: string;
  help_embed_title?: string;
  help_embed_color?: string;
  help_embed_description?: string;
  help_embed_fields?: Array<{ name: string; value: string; inline?: boolean }>;
  help_embed_footer_text?: string;
  help_embed_show_timestamp?: boolean;
  music_setup_embed_title?: string;
  music_setup_embed_description?: string;
  music_setup_embed_fields?: Array<{ name: string; value: string; inline?: boolean }>;
  error_log_channel_id?: string | null;
  show_traceback_to_user?: boolean;
  last_heartbeat_at?: string | null;
};

type RewardChannel = { channel_id: string; enabled: boolean };
type DiscordChannel = { id: string; name: string };

function HeartbeatStatus({ lastAt }: { lastAt?: string | null }) {
  if (!lastAt) return <span className="text-red-500">오프라인</span>;
  
  const last = new Date(lastAt).getTime();
  const diff = Date.now() - last;
  const isOnline = diff < 30000;

  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full animate-pulse ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className={isOnline ? 'text-green-500' : 'text-red-500'}>
        {isOnline ? '온라인' : '응답 없음'}
      </span>
      <span className="text-[10px] muted">({new Date(lastAt).toLocaleString()})</span>
    </div>
  );
}

function parseDiscordEmojis(text: string) {
  const emojiRegex = /<(a?):([^:]+):(\d+)>/g;
  const rawParts = text.split('\n');
  const result = [];

  for (let i = 0; i < rawParts.length; i++) {
    const line = rawParts[i];
    let lastIndex = 0;
    let match;

    while ((match = emojiRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        result.push(line.substring(lastIndex, match.index));
      }

      const isAnimated = match[1] === 'a';
      const emojiId = match[3];
      const extension = isAnimated ? 'gif' : 'png';
      const url = `https://cdn.discordapp.com/emojis/${emojiId}.${extension}`;

      result.push(
        <img
          key={`${emojiId}-${i}-${match.index}`}
          src={url}
          alt={match[2]}
          className="inline-block h-[1.375em] w-[1.375em] align-text-bottom mx-[0.05em]"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      );

      lastIndex = emojiRegex.lastIndex;
    }

    if (lastIndex < line.length) {
      result.push(line.substring(lastIndex));
    }

    if (i < rawParts.length - 1) {
      result.push(<br key={`br-${i}`} />);
    }
  }

  return result;
}

export default function BotSettingsClient() {
  const toast = useToast();
  const router = useRouter();
  const [cfg, setCfg] = useState<BotConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [rewardChannels, setRewardChannels] = useState<string[]>([]);
  const [rewardSearch, setRewardSearch] = useState('');
  const [rewardSaving, setRewardSaving] = useState(false);

  type PointEventLog = {
    id: string;
    discord_user_id: string;
    kind: string;
    amount: number;
    created_at: string;
    meta: unknown;
    users?: {
      username: string;
      avatar_url: string | null;
    };
  };
  const [logs, setLogs] = useState<PointEventLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [currentTab, setCurrentTab] = useState<'general' | 'embed' | 'log'>('general');
  const [embedSection, setEmbedSection] = useState<'gacha' | 'inventory' | 'help' | 'music'>('gacha');
  const [previewTab, setPreviewTab] = useState<'main' | 'processing' | 'result' | 'inventory' | 'help'>('main');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cfgRes, chRes, rcRes] = await Promise.all([
          fetch('/api/admin/bot-config'),
          fetch('/api/admin/discord/channels'),
          fetch('/api/admin/reward-channels')
        ]);

        if (cfgRes.ok) {
          setCfg(await cfgRes.json());
        }

        if (chRes.ok) {
          const body = await chRes.json();
          setChannels(body.channels ?? []);
        }

        if (rcRes.ok) {
          const body = await rcRes.json();
          const enabledIds = (body.channels ?? [])
            .filter((c: RewardChannel) => c.enabled)
            .map((c: RewardChannel) => c.channel_id);
          setRewardChannels(enabledIds);
        }
      } catch (e) {
        console.error('Failed to load bot settings', e);
        toast.error('설정을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [toast]);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/admin/logs');
      if (res.ok) {
        setLogs(await res.json());
      }
    } catch (e) {
      console.error('Failed to load logs', e);
      toast.error('로그를 불러오지 못했습니다.');
    } finally {
      setLogsLoading(false);
    }
  }, [toast]);

  // Log fetch effect
  useEffect(() => {
    if (currentTab === 'log') {
      void fetchLogs();
    }
  }, [currentTab, fetchLogs]);

  const saveConfig = useCallback(async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/bot-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCfg(data);
      toast.success('저장했습니다.');
    } catch (e) {
      console.error('Failed to save bot config', e);
      toast.error('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }, [cfg, toast]);

  const saveRewardChannels = useCallback(async () => {
    setRewardSaving(true);
    try {
      const res = await fetch('/api/admin/reward-channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabledChannelIds: rewardChannels })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('보상 채널 설정을 저장했습니다.');
    } catch (e) {
      console.error('Failed to save reward channels', e);
      toast.error('채널 설정 저장에 실패했습니다.');
    } finally {
      setRewardSaving(false);
    }
  }, [rewardChannels, toast]);

  const toggleRewardChannel = (id: string) => {
    setRewardChannels(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return Array.from(s);
    });
  };

  const filteredChannels = channels.filter(c => 
    c.name.toLowerCase().includes(rewardSearch.toLowerCase()) || 
    c.id.includes(rewardSearch)
  );

  if (loading) {
    return (
      <main className="p-6">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm muted">불러오는 중…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="p-6 pb-20">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-500 border border-indigo-500/20">
              <Bot className="h-6 w-6" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight font-bangul">봇 설정</h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm muted">쿠로봇의 상태와 행동 방식을 설정합니다.</p>
                <div className="h-1 w-1 rounded-full bg-[color:var(--muted-2)]" />
                <HeartbeatStatus lastAt={cfg?.last_heartbeat_at} />
              </div>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl btn-soft px-3 py-2 text-xs font-semibold"
            onClick={() => router.back()}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
            <span>돌아가기</span>
          </button>
        </div>

        <div className="flex gap-2 mb-6 border-b border-[color:var(--border)] pb-1">
          <button
            type="button"
            onClick={() => setCurrentTab('general')}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
              currentTab === 'general'
                ? 'border-indigo-500 text-indigo-500'
                : 'border-transparent text-[color:var(--muted)] hover:text-[color:var(--fg)]'
            }`}
          >
            기본 설정
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('embed')}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
              currentTab === 'embed'
                ? 'border-indigo-500 text-indigo-500'
                : 'border-transparent text-[color:var(--muted)] hover:text-[color:var(--fg)]'
            }`}
          >
            Embed 설정
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('log')}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
              currentTab === 'log'
                ? 'border-indigo-500 text-indigo-500'
                : 'border-transparent text-[color:var(--muted)] hover:text-[color:var(--fg)]'
            }`}
          >
            쿠로 Log
          </button>
        </div>

        {currentTab === 'general' ? (
          <div className="space-y-8">
            <section className="rounded-3xl card-glass p-6">
              <h2 className="text-lg font-semibold mb-4">기본 설정</h2>
              <div className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                      <label className="text-sm font-semibold block mb-2">데이터 동기화 주기 (ms)</label>
                      <input
                        type="number"
                        className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20"
                        value={cfg?.bot_sync_interval_ms ?? 5000}
                        onChange={(e) => setCfg(prev => prev ? ({ ...prev, bot_sync_interval_ms: Number(e.target.value) }) : null)}
                        step={1000}
                        min={1000}
                        aria-label="데이터 동기화 주기 (밀리초)"
                      />
                    <p className="mt-1 text-[10px] muted">역할 동기화 및 생존 신고(Heartbeat) 주기입니다.</p>
                  </div>
                  <div className="flex flex-col justify-center p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 mt-6">
                    <div className="text-xs font-semibold text-indigo-500/70 uppercase tracking-wider mb-1">현재 상태</div>
                    <HeartbeatStatus lastAt={cfg?.last_heartbeat_at} />
                  </div>
                </div>

                <label className="flex items-center gap-3 p-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] cursor-pointer hover:bg-[color:var(--bg)] transition-colors">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--card)] border border-[color:var(--border)]">
                    <input
                      type="checkbox"
                      className="w-5 h-5 rounded border-gray-300 text-[color:var(--accent-pink)] focus:ring-[color:var(--accent-pink)] cursor-pointer"
                      checked={cfg?.reward_emoji_enabled ?? true}
                      onChange={(e) => setCfg(prev => prev ? ({ ...prev, reward_emoji_enabled: e.target.checked }) : null)}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold flex items-center gap-2">
                      채팅 보상 알림 (💰)
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        (cfg?.reward_emoji_enabled ?? true) 
                          ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                          : 'bg-gray-500/10 text-gray-500 border-gray-500/20'
                      }`}>
                        {(cfg?.reward_emoji_enabled ?? true) ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <div className="text-xs muted mt-0.5">채팅으로 포인트를 획득했을 때 봇이 메시지에 반응을 남깁니다.</div>
                  </div>
                </label>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold">쿠로봇 페르소나 (System Prompt)</label>
                    <span className="text-[10px] muted bg-[color:var(--chip)] px-2 py-1 rounded-lg border border-[color:var(--border)]">Gemini AI</span>
                  </div>
                  <div className="relative">
                    <textarea
                      className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-3 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)] font-mono leading-relaxed focus:ring-2 focus:ring-[color:var(--accent-pink)]/20 focus:border-[color:var(--accent-pink)]/50 transition-all outline-none"
                      rows={10}
                      value={cfg?.persona_prompt ?? ''}
                      onChange={(e) => setCfg(prev => prev ? ({ ...prev, persona_prompt: e.target.value }) : null)}
                      placeholder="예: 너는 시크한 고양이 쿠로야. 반말로 대답해."
                      aria-label="시스템 프롬프트 (쿠로봇 페르소나)"
                    />
                    <div className="absolute bottom-3 right-3 text-[10px] muted bg-[color:var(--card)]/80 backdrop-blur px-2 py-1 rounded-md border border-[color:var(--border)]">
                      {(cfg?.persona_prompt ?? '').length} chars
                    </div>
                  </div>
                  <p className="mt-3 text-xs muted pl-1">
                    * 봇의 성격, 말투, 역할 지침을 자유롭게 설정하세요. 비워두면 코드 기본값이 적용됩니다.
                  </p>
                </div>

                <div className="pt-6 border-t border-[color:var(--border)]">
                  <h2 className="text-lg font-semibold mb-4">에러 로깅 설정</h2>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-semibold block mb-2">에러 로그 전송 채널</label>
                      <select
                        className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20 appearance-none"
                        value={cfg?.error_log_channel_id ?? ''}
                        onChange={(e) => setCfg(prev => prev ? ({ ...prev, error_log_channel_id: e.target.value || null }) : null)}
                        aria-label="에러 로그 전송 채널"
                      >
                        <option value="">(선택 안 함 - 전송하지 않음)</option>
                        {channels.map((ch) => (
                          <option key={ch.id} value={ch.id}>#{ch.name}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-[10px] muted">에러 발생 시 상세 로그와 Stack Trace를 지정된 채널로 보냅니다.</p>
                    </div>
                    <div className="flex flex-col justify-end">
                      <label className="flex items-center gap-3 p-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] cursor-pointer hover:bg-[color:var(--bg)] transition-colors">
                        <input
                          type="checkbox"
                          className="w-5 h-5 rounded border-gray-300 text-[color:var(--accent-pink)] focus:ring-[color:var(--accent-pink)] cursor-pointer"
                          checked={cfg?.show_traceback_to_user ?? true}
                          onChange={(e) => setCfg(prev => prev ? ({ ...prev, show_traceback_to_user: e.target.checked }) : null)}
                        />
                        <div className="flex-1">
                          <div className="text-xs font-bold">사용자에게 에러 메시지 표시</div>
                          <div className="text-[10px] muted">에러 ID 외에 실제 에러 내용(짧게)을 사용자에게도 보여줍니다.</div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl card-glass p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">보상 채널 (화이트리스트)</h2>
                <button
                  type="button"
                  className="rounded-xl btn-bangul px-4 py-2 text-xs font-semibold disabled:opacity-60"
                  onClick={() => void saveRewardChannels()}
                  disabled={rewardSaving}
                >
                  {rewardSaving ? '저장 중…' : '채널 설정 저장'}
                </button>
              </div>
              <p className="text-xs muted mb-4">선택된 채널에서만 채팅 보상이 적립됩니다.</p>
              
              <div className="mb-4">
                <input
                  type="text"
                  className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20"
                  value={rewardSearch}
                  onChange={(e) => setRewardSearch(e.target.value)}
                  placeholder="채널 이름으로 검색…"
                  aria-label="채널 검색"
                />
              </div>

              <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {filteredChannels.map((ch) => {
                  const isEnabled = rewardChannels.includes(ch.id);
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => toggleRewardChannel(ch.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all ${
                        isEnabled 
                          ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-500' 
                          : 'bg-[color:var(--chip)] border-transparent text-[color:var(--muted-2)]'
                      }`}
                    >
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-bold">#{ch.name}</span>
                        <span className="text-[10px] opacity-60">{ch.id}</span>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-[10px] font-bold ${
                        isEnabled ? 'bg-indigo-500 text-white' : 'bg-gray-500/20'
                      }`}>
                        {isEnabled ? '허용됨' : '차단됨'}
                      </div>
                    </button>
                  );
                })}
                {filteredChannels.length === 0 && (
                  <p className="text-center py-8 text-sm muted">검색 결과가 없습니다.</p>
                )}
              </div>
            </section>
          </div>
        ) : currentTab === 'embed' ? (
          <div className="space-y-6">
            <section className="rounded-3xl card-glass overflow-hidden">
              <button
                type="button"
                onClick={() => setEmbedSection(embedSection === 'gacha' ? 'gacha' : 'gacha')}
                className="w-full flex items-center justify-between p-6 hover:bg-black/5 transition-colors text-left"
              >
                <div>
                  <h2 className="text-lg font-semibold">가챠 UI</h2>
                  <p className="text-xs muted">뽑기 관련 Embed 메시지를 설정합니다.</p>
                </div>
                <div className={`w-6 h-6 flex items-center justify-center rounded-full border border-[color:var(--border)] transition-transform ${embedSection === 'gacha' ? 'bg-indigo-500 text-white border-indigo-500' : ''}`}>
                  {embedSection === 'gacha' ? <Check className="w-3 h-3" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>
              
              {embedSection === 'gacha' && (
                <div className="p-6 border-t border-[color:var(--border)]">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-semibold block mb-2">가챠 Embed 제목</label>
                        <input
                          type="text"
                          className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20"
                          value={cfg?.gacha_embed_title ?? ''}
                          onChange={(e) => setCfg(prev => prev ? ({ ...prev, gacha_embed_title: e.target.value }) : null)}
                          placeholder="🎰 가챠 뽑기"
                          aria-label="가챠 Embed 제목"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold block mb-2">가챠 Embed 색상 (Hex)</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            className="h-9 w-12 rounded-lg border border-[color:var(--border)] bg-[color:var(--chip)] p-1 cursor-pointer"
                            value={cfg?.gacha_embed_color ?? '#5865F2'}
                            onChange={(e) => setCfg(prev => prev ? ({ ...prev, gacha_embed_color: e.target.value }) : null)}
                          />
                          <input
                            type="text"
                            className="flex-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20 font-mono"
                            value={cfg?.gacha_embed_color ?? '#5865F2'}
                            onChange={(e) => setCfg(prev => prev ? ({ ...prev, gacha_embed_color: e.target.value }) : null)}
                            placeholder="#5865F2"
                            aria-label="가챠 Embed 색상 (Hex)"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-semibold block mb-2">가챠 Embed 설명 (템플릿)</label>
                        <textarea
                          className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20 min-h-[120px] font-mono"
                          value={cfg?.gacha_embed_description ?? ''}
                          onChange={(e) => setCfg(prev => prev ? ({ ...prev, gacha_embed_description: e.target.value }) : null)}
                           placeholder="현재 포인트: {points}p…"
                          aria-label="가챠 Embed 설명 (템플릿)"
                        />
                        <p className="mt-1 text-[10px] muted">
                          사용 가능: {'{points}, {cost1}, {cost10}, {pity}, {rarityDisplay}'}
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 border-t border-[color:var(--border)] pt-4">
                        <div>
                          <label className="text-sm font-semibold block mb-2">뽑는 중… 제목</label>
                          <input
                            type="text"
                            className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20"
                            value={cfg?.gacha_processing_title ?? ''}
                            onChange={(e) => setCfg(prev => prev ? ({ ...prev, gacha_processing_title: e.target.value }) : null)}
                            aria-label="뽑는 중 메시지 제목"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-semibold block mb-2">뽑는 중… 설명</label>
                          <input
                            type="text"
                            className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20"
                            value={cfg?.gacha_processing_description ?? ''}
                            onChange={(e) => setCfg(prev => prev ? ({ ...prev, gacha_processing_description: e.target.value }) : null)}
                            aria-label="뽑는 중 메시지 설명"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-semibold block mb-2">결과 Embed 제목</label>
                        <input
                          type="text"
                          className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20"
                          value={cfg?.gacha_result_title ?? ''}
                          onChange={(e) => setCfg(prev => prev ? ({ ...prev, gacha_result_title: e.target.value }) : null)}
                          aria-label="결과 Embed 제목"
                        />
                        <p className="mt-1 text-[10px] muted">사용 가능: {'{drawCount}'}</p>
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-semibold block">미리보기</label>
                        <div className="flex bg-[color:var(--chip)] p-1 rounded-xl border border-[color:var(--border)]">
                          <button
                            type="button"
                            onClick={() => setPreviewTab('main')}
                            className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${previewTab === 'main' ? 'bg-indigo-500 text-white shadow-sm' : 'muted hover:text-[color:var(--fg)]'}`}
                          >
                            기본
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewTab('processing')}
                            className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${previewTab === 'processing' ? 'bg-indigo-500 text-white shadow-sm' : 'muted hover:text-[color:var(--fg)]'}`}
                          >
                            진행중
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewTab('result')}
                            className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${previewTab === 'result' ? 'bg-indigo-500 text-white shadow-sm' : 'muted hover:text-[color:var(--fg)]'}`}
                          >
                            결과
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex-1 rounded-2xl bg-[#2b2d31] p-4 text-[#dbdee1] font-sans border border-black/20 shadow-inner min-h-[240px]">
                        <div className="flex gap-3 h-full">
                          <div className="w-[4px] rounded-full shrink-0" style={{ backgroundColor: cfg?.gacha_embed_color ?? '#5865F2' }} />
                          <div className="flex-1 min-w-0">
                            {previewTab === 'main' && (
                              <>
                                <div className="text-white font-bold text-base mb-1">
                                  {parseDiscordEmojis(cfg?.gacha_embed_title || '🎰 가챠 뽑기')}
                                </div>
                                <div className="text-sm leading-relaxed mb-3">
                                  {parseDiscordEmojis(
                                    (cfg?.gacha_embed_description || '')
                                      .replace('{points}', '36,130')
                                      .replace('{cost1}', '10')
                                      .replace('{cost10}', '100')
                                      .replace('{pity}', '\n천장: **5/100** (95회 남음, SSS 확정)')
                                      .replace('{rarityDisplay}', '**SSS (3%)**: @역할1\n**SS (17%)**: @역할2\n**S (75%)**: @역할3\n**R (5%)**: @역할4')
                                  )}
                                </div>
                                <div className="rounded-lg overflow-hidden border border-black/10 bg-black/20 aspect-[16/9] flex items-center justify-center text-[10px] muted uppercase tracking-widest">
                                  Banner Image Area
                                </div>
                              </>
                            )}

                            {previewTab === 'processing' && (
                              <>
                                <div className="text-white font-bold text-base mb-1">
                                  {parseDiscordEmojis((cfg?.gacha_processing_title || '🎲 뽑는 중...').replace('{drawCount}', '10'))}
                                </div>
                                <div className="text-sm leading-relaxed">
                                  {parseDiscordEmojis((cfg?.gacha_processing_description || '{drawCount}회 뽑기를 진행하고 있습니다...').replace('{drawCount}', '10'))}
                                </div>
                              </>
                            )}

                            {previewTab === 'result' && (
                              <>
                                <div className="text-white font-bold text-base mb-1">
                                  {parseDiscordEmojis((cfg?.gacha_result_title || '🎉 {drawCount}회 뽑기 결과').replace('{drawCount}', '10'))}
                                </div>
                                <div className="text-sm leading-relaxed mb-3">
                                  **SSS**: <span className="text-[#FFD700]">@역할1</span><br/>
                                  **S**: @역할3, @역할5
                                </div>
                                <div className="rounded-lg overflow-hidden border border-black/10 bg-black/20 aspect-[16/9] flex flex-col items-center justify-center gap-2">
                                  <div className="w-12 h-12 rounded-full border-4 border-t-indigo-500 border-r-transparent border-b-indigo-500 border-l-transparent animate-spin opacity-20" />
                                  <div className="text-[10px] muted uppercase tracking-widest text-center px-4">
                                    Canvas Generated Image Area<br/>
                                    (Gacha Result Grid)
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="mt-2 text-[10px] muted">* 실제 Discord에서는 다르게 보일 수 있습니다.</p>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-3xl card-glass overflow-hidden">
              <button
                type="button"
                onClick={() => setEmbedSection(embedSection === 'inventory' ? 'gacha' : 'inventory')}
                className="w-full flex items-center justify-between p-6 hover:bg-black/5 transition-colors text-left"
              >
                <div>
                  <h2 className="text-lg font-semibold">인벤토리 UI</h2>
                  <p className="text-xs muted">인벤토리 명령어 실행 시 보여질 내용을 설정합니다.</p>
                </div>
                <div className={`w-6 h-6 flex items-center justify-center rounded-full border border-[color:var(--border)] transition-transform ${embedSection === 'inventory' ? 'bg-indigo-500 text-white border-indigo-500' : ''}`}>
                  {embedSection === 'inventory' ? <Check className="w-3 h-3" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {embedSection === 'inventory' && (
                <div className="p-6 border-t border-[color:var(--border)]">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-semibold block mb-2">인벤토리 Embed 제목</label>
                        <input
                          type="text"
                          className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20"
                          value={cfg?.inventory_embed_title ?? ''}
                          onChange={(e) => setCfg(prev => prev ? ({ ...prev, inventory_embed_title: e.target.value }) : null)}
                          placeholder="🎒 인벤토리"
                          aria-label="인벤토리 Embed 제목"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold block mb-2">인벤토리 Embed 색상 (Hex)</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            className="h-9 w-12 rounded-lg border border-[color:var(--border)] bg-[color:var(--chip)] p-1 cursor-pointer"
                            value={cfg?.inventory_embed_color ?? '#5865F2'}
                            onChange={(e) => setCfg(prev => prev ? ({ ...prev, inventory_embed_color: e.target.value }) : null)}
                          />
                          <input
                            type="text"
                            className="flex-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20 font-mono"
                            value={cfg?.inventory_embed_color ?? '#5865F2'}
                            onChange={(e) => setCfg(prev => prev ? ({ ...prev, inventory_embed_color: e.target.value }) : null)}
                            placeholder="#5865F2"
                            aria-label="인벤토리 Embed 색상 (Hex)"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-semibold block mb-2">인벤토리 Embed 설명 (템플릿)</label>
                        <textarea
                          className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20 min-h-[80px] font-mono"
                          value={cfg?.inventory_embed_description ?? ''}
                          onChange={(e) => setCfg(prev => prev ? ({ ...prev, inventory_embed_description: e.target.value }) : null)}
                          placeholder="{user}님의 인벤토리입니다.\n현재 포인트: **{points}p**"
                          aria-label="인벤토리 Embed 설명 (템플릿)"
                        />
                        <p className="mt-1 text-[10px] muted">사용 가능: {'{user}, {points}, {itemCount}'}</p>
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <label className="text-sm font-semibold block mb-2">미리보기</label>
                      <div className="flex-1 rounded-2xl bg-[#2b2d31] p-4 text-[#dbdee1] font-sans border border-black/20 shadow-inner min-h-[240px]">
                        <div className="flex gap-3 h-full">
                          <div className="w-[4px] rounded-full shrink-0" style={{ backgroundColor: cfg?.inventory_embed_color ?? '#5865F2' }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-white font-bold text-base mb-1">
                              {parseDiscordEmojis(cfg?.inventory_embed_title || '🎒 인벤토리')}
                            </div>
                            <div className="text-sm leading-relaxed mb-3">
                              {parseDiscordEmojis(
                                (cfg?.inventory_embed_description || '{user}님의 인벤토리입니다.\n현재 포인트: **{points}p**')
                                  .replace('{user}', 'User')
                                  .replace('{points}', '36,130')
                                  .replace('{itemCount}', '5')
                              )}
                            </div>
                            <div className="text-sm leading-relaxed">
                              - 👑 **SSS 아이템** (SSS) x1<br/>
                              - ⚔️ **SS 아이템** (SS) x2<br/>
                              - 🛡️ **S 아이템** (S) x5<br/>
                              <span className="text-[10px] muted mt-2 block">총 8개 아이템 보유 중</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <p className="mt-2 text-[10px] muted">* 실제 Discord에서는 다르게 보일 수 있습니다.</p>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-3xl card-glass overflow-hidden">
              <button
                type="button"
                onClick={() => setEmbedSection(embedSection === 'help' ? 'gacha' : 'help')}
                className="w-full flex items-center justify-between p-6 hover:bg-black/5 transition-colors text-left"
              >
                <div>
                  <h2 className="text-lg font-semibold">도움말 UI</h2>
                  <p className="text-xs muted">/도움말 명령어 실행 시 보여질 내용을 설정합니다.</p>
                </div>
                <div className={`w-6 h-6 flex items-center justify-center rounded-full border border-[color:var(--border)] transition-transform ${embedSection === 'help' ? 'bg-indigo-500 text-white border-indigo-500' : ''}`}>
                  {embedSection === 'help' ? <Check className="w-3 h-3" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {embedSection === 'help' && (
                <div className="p-6 border-t border-[color:var(--border)]">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-semibold block mb-2">도움말 Embed 제목</label>
                        <input
                          type="text"
                          className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20"
                          value={cfg?.help_embed_title ?? ''}
                          onChange={(e) => setCfg(prev => prev ? ({ ...prev, help_embed_title: e.target.value }) : null)}
                          placeholder="💕 방울냥 봇 도움말"
                          aria-label="도움말 Embed 제목"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold block mb-2">도움말 Embed 색상 (Hex)</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            className="h-9 w-12 rounded-lg border border-[color:var(--border)] bg-[color:var(--chip)] p-1 cursor-pointer"
                            value={cfg?.help_embed_color ?? '#FF69B4'}
                            onChange={(e) => setCfg(prev => prev ? ({ ...prev, help_embed_color: e.target.value }) : null)}
                          />
                          <input
                            type="text"
                            className="flex-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20 font-mono"
                            value={cfg?.help_embed_color ?? '#FF69B4'}
                            onChange={(e) => setCfg(prev => prev ? ({ ...prev, help_embed_color: e.target.value }) : null)}
                            placeholder="#FF69B4"
                            aria-label="도움말 Embed 색상 (Hex)"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-semibold block mb-2">도움말 Embed 설명</label>
                        <textarea
                          className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20 min-h-[80px] font-mono"
                          value={cfg?.help_embed_description ?? ''}
                          onChange={(e) => setCfg(prev => prev ? ({ ...prev, help_embed_description: e.target.value }) : null)}
                          placeholder="사용 가능한 명령어 목록이야!"
                          aria-label="도움말 Embed 설명"
                        />
                      </div>
                      
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="text-sm font-semibold block mb-2">하단 문구 (Footer)</label>
                          <input
                            type="text"
                            className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20"
                            value={cfg?.help_embed_footer_text ?? ''}
                            onChange={(e) => setCfg(prev => prev ? ({ ...prev, help_embed_footer_text: e.target.value }) : null)}
                            placeholder="Nyaru Bot"
                            aria-label="도움말 Footer Text"
                          />
                        </div>
                        <div className="flex flex-col justify-end">
                          <label className="flex items-center gap-3 p-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] cursor-pointer hover:bg-[color:var(--bg)] transition-colors">
                            <input
                              type="checkbox"
                              className="w-5 h-5 rounded border-gray-300 text-[color:var(--accent-pink)] focus:ring-[color:var(--accent-pink)] cursor-pointer"
                              checked={cfg?.help_embed_show_timestamp ?? true}
                              onChange={(e) => setCfg(prev => prev ? ({ ...prev, help_embed_show_timestamp: e.target.checked }) : null)}
                            />
                            <div className="flex-1">
                              <div className="text-xs font-bold">타임스탬프 표시</div>
                              <div className="text-[10px] muted">Embed 하단에 현재 시간을 표시합니다.</div>
                            </div>
                          </label>
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-semibold block mb-2">명령어 목록 (Fields JSON)</label>
                        <textarea
                          className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20 min-h-[200px] font-mono"
                          value={JSON.stringify(cfg?.help_embed_fields || [
                            { name: '/뽑기', value: '가챠를 돌려 역할을 뽑아봐!', inline: true },
                            { name: '/가방', value: '보유한 아이템 목록을 확인해.', inline: true }
                          ], null, 2)}
                          onChange={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value);
                              setCfg(prev => prev ? ({ ...prev, help_embed_fields: parsed }) : null);
                            } catch (err) {
                              // Ignore invalid JSON
                            }
                          }}
                          placeholder='[{"name": "/명령어", "value": "설명", "inline": true}]'
                          aria-label="도움말 Embed 필드 (JSON)"
                        />
                        <p className="mt-1 text-[10px] muted">JSON 형식으로 입력: <code>name</code>, <code>value</code>, <code>inline</code></p>
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <label className="text-sm font-semibold block mb-2">미리보기</label>
                      <div className="flex-1 rounded-2xl bg-[#2b2d31] p-4 text-[#dbdee1] font-sans border border-black/20 shadow-inner min-h-[240px]">
                        <div className="flex gap-3 h-full">
                          <div className="w-[4px] rounded-full shrink-0" style={{ backgroundColor: cfg?.help_embed_color ?? '#FF69B4' }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-white font-bold text-base mb-1">
                              {parseDiscordEmojis(cfg?.help_embed_title || '💕 방울냥 봇 도움말')}
                            </div>
                            <div className="text-sm leading-relaxed mb-3">
                              {parseDiscordEmojis(cfg?.help_embed_description || '사용 가능한 명령어 목록이야!')}
                            </div>
                            <div className="grid grid-cols-1 gap-2 text-sm">
                              {(cfg?.help_embed_fields || [
                                { name: '/뽑기', value: '가챠를 돌려 역할을 뽑아봐!', inline: true },
                                { name: '/가방', value: '보유한 아이템 목록을 확인해.', inline: true },
                                { name: '/장착 [이름]', value: '아이템을 장착하고 역할을 받아.', inline: false },
                                { name: '...', value: '(더 많은 명령어...)', inline: true }
                              ]).map((field, idx) => (
                                <div key={idx} className={field.inline ? 'inline-block mr-4 mb-2' : 'block mb-2'}>
                                  <div className="font-bold text-xs opacity-90">{field.name}</div>
                                  <div className="text-xs opacity-80">{field.value}</div>
                                </div>
                              ))}
                            </div>
                            
                            <div className="mt-4 flex items-center gap-2 text-[10px] muted opacity-70 border-t border-white/10 pt-2">
                              {/* Footer preview */}
                              <span>{cfg?.help_embed_footer_text || 'Nyaru Bot'}</span>
                              {cfg?.help_embed_show_timestamp !== false && (
                                <>
                                  <span className="text-[8px]">•</span>
                                  <span>오늘 {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <p className="mt-2 text-[10px] muted">* 실제 Discord에서는 다르게 보일 수 있습니다.</p>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-3xl card-glass overflow-hidden">
              <button
                type="button"
                onClick={() => setEmbedSection(embedSection === 'music' ? 'gacha' : 'music')}
                className="w-full flex items-center justify-between p-6 hover:bg-black/5 transition-colors text-left"
              >
                <div>
                  <h2 className="text-lg font-semibold">음악 셋업 UI</h2>
                  <p className="text-xs muted">/셋업 안내 Embed 메시지를 설정합니다.</p>
                </div>
                <div className={`w-6 h-6 flex items-center justify-center rounded-full border border-[color:var(--border)] transition-transform ${embedSection === 'music' ? 'bg-indigo-500 text-white border-indigo-500' : ''}`}>
                  {embedSection === 'music' ? <Check className="w-3 h-3" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {embedSection === 'music' && (
                <div className="p-6 border-t border-[color:var(--border)]">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-semibold block mb-2">셋업 Embed 제목</label>
                        <input
                          type="text"
                          className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20"
                          value={cfg?.music_setup_embed_title ?? ''}
                          onChange={(e) => setCfg(prev => prev ? ({ ...prev, music_setup_embed_title: e.target.value }) : null)}
                          placeholder="🎶 음악 채널 설정 완료"
                          aria-label="음악 셋업 Embed 제목"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold block mb-2">셋업 Embed 설명</label>
                        <textarea
                          className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20 min-h-[100px] font-mono"
                          value={cfg?.music_setup_embed_description ?? ''}
                          onChange={(e) => setCfg(prev => prev ? ({ ...prev, music_setup_embed_description: e.target.value }) : null)}
                          placeholder="이 채널({channel})이 음악 명령어 채널로 설정되었습니다."
                          aria-label="음악 셋업 Embed 설명"
                        />
                        <p className="mt-1 text-[10px] muted">사용 가능: {'{channel}'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-semibold block mb-2">셋업 Embed 필드 (JSON)</label>
                        <textarea
                          className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20 min-h-[160px] font-mono"
                          value={JSON.stringify(cfg?.music_setup_embed_fields || [], null, 2)}
                          onChange={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value);
                              setCfg(prev => prev ? ({ ...prev, music_setup_embed_fields: parsed }) : null);
                            } catch {
                              // Ignore invalid JSON
                            }
                          }}
                          placeholder='[{"name": "음악 검색", "value": "버튼을 눌러 검색 모달을 열어주세요.", "inline": false}]'
                          aria-label="음악 셋업 Embed 필드 (JSON)"
                        />
                        <p className="mt-1 text-[10px] muted">JSON 형식: <code>name</code>, <code>value</code>, <code>inline</code></p>
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <label className="text-sm font-semibold block mb-2">미리보기</label>
                      <div className="flex-1 rounded-2xl bg-[#2b2d31] p-4 text-[#dbdee1] font-sans border border-black/20 shadow-inner min-h-[200px]">
                        <div className="flex gap-3 h-full">
                          <div className="w-[4px] rounded-full shrink-0" style={{ backgroundColor: '#3b82f6' }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-white font-bold text-base mb-1">
                              {parseDiscordEmojis(cfg?.music_setup_embed_title || '🎶 음악 채널 설정 완료')}
                            </div>
                            <div className="text-sm leading-relaxed mb-3">
                              {parseDiscordEmojis(
                                (cfg?.music_setup_embed_description || '이 채널({channel})이 음악 명령어 채널로 설정되었습니다.')
                                  .replace('{channel}', '#음악')
                              )}
                            </div>
                            {!!(cfg?.music_setup_embed_fields && cfg.music_setup_embed_fields.length) && (
                              <div className="grid grid-cols-1 gap-2 text-sm mb-3">
                                {cfg.music_setup_embed_fields.map((field, idx) => (
                                  <div key={idx} className={field.inline ? 'inline-block mr-4 mb-2' : 'block mb-2'}>
                                    <div className="font-bold text-xs opacity-90">{field.name}</div>
                                    <div className="text-xs opacity-80">{field.value}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="text-xs muted">버튼: 음악 검색 · 명령어 보기 · 대기열</div>
                          </div>
                        </div>
                      </div>
                      <p className="mt-2 text-[10px] muted">* 실제 Discord에서는 다르게 보일 수 있습니다.</p>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-3xl card-glass p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">봇 활동 로그</h2>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[color:var(--chip)] border border-[color:var(--border)] hover:bg-[color:var(--bg)] transition-colors"
                  onClick={() => void fetchLogs()}
                >
                  새로고침
                </button>
              </div>
              
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg)] overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-[color:var(--chip)] border-b border-[color:var(--border)] text-xs uppercase muted font-semibold">
                    <tr>
                      <th className="px-4 py-3">시간</th>
                      <th className="px-4 py-3">사용자</th>
                      <th className="px-4 py-3">유형</th>
                      <th className="px-4 py-3 text-right">변동량</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--border)]">
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center muted">
                          {logsLoading ? '로그를 불러오는 중...' : '기록된 로그가 없습니다.'}
                        </td>
                      </tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id} className="hover:bg-[color:var(--chip)]/50 transition-colors">
                          <td className="px-4 py-3 text-xs muted whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            <div className="flex items-center gap-3">
                              {log.users?.avatar_url ? (
                                <img 
                                  src={log.users.avatar_url} 
                                  alt="User Avatar" 
                                  className="w-8 h-8 rounded-full border border-[color:var(--border)]"
                                  onError={(e) => { (e.target as HTMLImageElement).src = 'https://cdn.discordapp.com/embed/avatars/0.png'; }}
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-[color:var(--chip)] border border-[color:var(--border)] flex items-center justify-center text-[10px] muted">
                                  ?
                                </div>
                              )}
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold">{log.users?.username || '알 수 없는 사용자'}</span>
                                <span className="text-[10px] muted font-mono opacity-60">{log.discord_user_id}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] border ${
                              log.kind === 'chat_grant' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                              log.kind === 'gacha_cost' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                              'bg-gray-500/10 text-gray-500 border-gray-500/20'
                            }`}>
                              {log.kind}
                            </span>
                          </td>
                          <td className={`px-4 py-3 text-right font-mono ${log.amount > 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {log.amount > 0 ? '+' : ''}{log.amount}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-xs muted text-center">최근 50개의 포인트 변동 내역을 표시합니다.</p>
            </section>
          </div>
        )}

        <div className="sticky bottom-6 z-10 mt-8 flex justify-end">
          <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--card)]/80 backdrop-blur px-3 py-3 shadow-[0_18px_46px_rgba(0,0,0,0.12)]">
            <button
              type="button"
              className="rounded-2xl btn-bangul px-6 py-3 text-sm font-bold shadow-lg disabled:opacity-60 transition-transform active:scale-95"
              disabled={saving}
              onClick={() => void saveConfig()}
            >
              {saving ? '저장 중…' : '변경사항 저장'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
