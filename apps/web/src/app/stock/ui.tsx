'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, CandlestickChart, Coins, RefreshCcw, Wallet } from 'lucide-react';

type StockCandle = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

type StockDashboard = {
  symbol: string;
  displayName: string;
  price: number;
  changePct: number;
  feeBps: number;
  balance: number;
  pointBalance: number;
  holdingQty: number;
  holdingAvgPrice: number;
  holdingValue: number;
  unrealizedPnl: number;
  candles: StockCandle[];
};

type TradeResult = {
  side: string | null;
  qty: number;
  price: number;
  gross: number;
  fee: number;
  settlement: number;
  holdingQty: number;
  holdingAvgPrice: number;
};

type ThemeMode = 'light' | 'dark';

const CANDLE_WINDOW = 72;
const FIVE_MINUTE_MS = 5 * 60 * 1000;
const FALLBACK_BASE_TS = Date.UTC(2024, 0, 1, 0, 0, 0);

function currentThemeMode(): ThemeMode {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function useThemeMode() {
  const [theme, setTheme] = useState<ThemeMode>('light');

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setTheme(currentThemeMode());
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    window.addEventListener('storage', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('storage', sync);
    };
  }, []);

  return theme;
}

const toSafeNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function normalizeDashboard(raw: unknown): StockDashboard {
  const body = (raw ?? {}) as Record<string, unknown>;
  const candlesRaw = Array.isArray(body.candles) ? body.candles : [];
  const candles = candlesRaw
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      const c = toSafeNumber(row.c);
      const o = toSafeNumber(row.o, c);
      const h = Math.max(toSafeNumber(row.h, c), o, c);
      const l = Math.min(toSafeNumber(row.l, c), o, c);
      return {
        t: String(row.t ?? ''),
        o,
        h,
        l,
        c,
        v: Math.max(0, toSafeNumber(row.v)),
      };
    })
    .filter((c) => c.t.length > 0 && c.c > 0 && c.h > 0 && c.l > 0);

  return {
    symbol: String(body.symbol ?? 'KURO'),
    displayName: String(body.displayName ?? '쿠로 주식'),
    price: toSafeNumber(body.price),
    changePct: toSafeNumber(body.changePct),
    feeBps: toSafeNumber(body.feeBps, 150),
    balance: toSafeNumber(body.balance),
    pointBalance: toSafeNumber(body.pointBalance),
    holdingQty: toSafeNumber(body.holdingQty),
    holdingAvgPrice: toSafeNumber(body.holdingAvgPrice),
    holdingValue: toSafeNumber(body.holdingValue),
    unrealizedPnl: toSafeNumber(body.unrealizedPnl),
    candles,
  };
}

function fallbackCandles(price: number): StockCandle[] {
  const safePrice = Math.max(1, price || 1000);
  return Array.from({ length: CANDLE_WINDOW }).map((_, idx) => ({
    t: new Date(FALLBACK_BASE_TS + idx * FIVE_MINUTE_MS).toISOString(),
    o: safePrice,
    h: safePrice,
    l: safePrice,
    c: safePrice,
    v: 0,
  }));
}

function normalizeCandles(candles: StockCandle[], fallbackPrice: number): StockCandle[] {
  const sorted = [...candles]
    .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())
    .slice(-CANDLE_WINDOW);

  if (sorted.length === 0) return fallbackCandles(fallbackPrice);
  if (sorted.length >= CANDLE_WINDOW) return sorted;

  const missing = CANDLE_WINDOW - sorted.length;
  const base = Math.max(1, sorted[0].o || sorted[0].c || fallbackPrice || 1000);
  const firstTime = new Date(sorted[0].t).getTime();
  const startTime = Number.isNaN(firstTime)
    ? FALLBACK_BASE_TS
    : firstTime - missing * FIVE_MINUTE_MS;

  const padded = Array.from({ length: missing }).map((_, idx) => {
    const ts = new Date(startTime + idx * FIVE_MINUTE_MS).toISOString();
    return { t: ts, o: base, h: base, l: base, c: base, v: 0 };
  });

  return [...padded, ...sorted];
}

function movingAverage(candles: StockCandle[], windowSize: number): Array<number | null> {
  const result: Array<number | null> = [];
  let sum = 0;

  for (let i = 0; i < candles.length; i += 1) {
    sum += candles[i].c;
    if (i >= windowSize) sum -= candles[i - windowSize].c;
    if (i < windowSize - 1) result.push(null);
    else result.push(sum / windowSize);
  }

  return result;
}

function formatTime(ts: string) {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return '--:--';
  return d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  });
}

function signed(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toLocaleString('ko-KR')}`;
}

function signedPct(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function tradeImpactBpsForQty(qty: number) {
  return Math.min(320, Math.max(12, Math.ceil(Math.sqrt(Math.max(qty, 0)) * 12)));
}

function estimateTrade(side: 'buy' | 'sell', qty: number, price: number, feeBps: number) {
  const q = Math.max(Math.floor(qty), 0);
  const p = Math.max(Math.floor(price), 1);
  const feeRate = Math.max(feeBps, 0);

  if (q <= 0) {
    return {
      impactBps: 0,
      execPrice: p,
      gross: 0,
      fee: 0,
      settlement: 0,
    };
  }

  const impactBps = tradeImpactBpsForQty(q);
  const priceDelta = Math.max(1, Math.round((p * impactBps) / 10000));
  const postPrice = side === 'buy' ? p + priceDelta : Math.max(50, p - priceDelta);
  const execPrice = Math.max(1, Math.round((p + postPrice) / 2));
  const gross = execPrice * q;
  const fee = Math.ceil((gross * feeRate) / 10000);
  const settlement = side === 'buy' ? gross + fee : Math.max(gross - fee, 0);

  return {
    impactBps,
    execPrice,
    gross,
    fee,
    settlement,
  };
}

function StockChart({ status }: { status: StockDashboard | null }) {
  const theme = useThemeMode();
  const palette = useMemo(
    () =>
      theme === 'dark'
        ? {
            pricePanelBg: 'rgba(15,23,42,0.82)',
            pricePanelStroke: 'rgba(148,163,184,0.32)',
            volumePanelBg: 'rgba(15,23,42,0.76)',
            volumePanelStroke: 'rgba(148,163,184,0.26)',
            grid: 'rgba(148,163,184,0.20)',
            axis: 'rgba(226,232,240,0.88)',
            axisMuted: 'rgba(226,232,240,0.76)',
            up: '#ef4444',
            down: '#60a5fa',
            upVolume: 'rgba(239,68,68,0.58)',
            downVolume: 'rgba(96,165,250,0.58)',
            maFast: 'rgba(250,204,21,0.96)',
            maSlow: 'rgba(248,250,252,0.84)',
            avgLine: 'rgba(45,212,191,0.9)',
            avgLabel: 'rgba(94,234,212,0.96)',
          }
        : {
            pricePanelBg: 'rgba(255,255,255,0.96)',
            pricePanelStroke: 'rgba(28,36,66,0.24)',
            volumePanelBg: 'rgba(255,255,255,0.93)',
            volumePanelStroke: 'rgba(28,36,66,0.2)',
            grid: 'rgba(28,36,66,0.12)',
            axis: 'rgba(28,36,66,0.86)',
            axisMuted: 'rgba(28,36,66,0.74)',
            up: '#e11d48',
            down: '#2563eb',
            upVolume: 'rgba(225,29,72,0.36)',
            downVolume: 'rgba(37,99,235,0.34)',
            maFast: 'rgba(217,119,6,0.92)',
            maSlow: 'rgba(71,85,105,0.82)',
            avgLine: 'rgba(13,148,136,0.86)',
            avgLabel: 'rgba(15,118,110,0.96)',
          },
    [theme],
  );

  const candles = useMemo(
    () => normalizeCandles(status?.candles ?? [], status?.price ?? 1000),
    [status?.candles, status?.price],
  );

  const ma5 = useMemo(() => movingAverage(candles, 5), [candles]);
  const ma20 = useMemo(() => movingAverage(candles, 20), [candles]);
  const holdingAvgPrice =
    status && status.holdingQty > 0 && status.holdingAvgPrice > 0 ? status.holdingAvgPrice : null;

  const { priceTop, priceBottom, plotW, plotH, volH, maxVolume } = useMemo(() => {
    const highs = candles.map((c) => c.h);
    const lows = candles.map((c) => c.l);
    if (holdingAvgPrice != null) {
      highs.push(holdingAvgPrice);
      lows.push(holdingAvgPrice);
    }
    const top = Math.max(...highs);
    const bottom = Math.min(...lows);
    const range = Math.max(1, top - bottom);
    const pad = Math.max(12, range * 0.08);
    return {
      priceTop: top + pad,
      priceBottom: Math.max(1, bottom - pad),
      plotW: 1020,
      plotH: 350,
      volH: 90,
      maxVolume: Math.max(1, ...candles.map((c) => c.v)),
    };
  }, [candles, holdingAvgPrice]);

  const x0 = 24;
  const y0 = 16;
  const gap = 18;
  const volumeY0 = y0 + plotH + gap;
  const xStep = plotW / candles.length;
  const candleWidth = Math.max(7, Math.min(14, xStep * 0.92));
  const yScale = Math.max(1, priceTop - priceBottom);

  const yAtPrice = (price: number) => y0 + ((priceTop - price) / yScale) * plotH;

  return (
    <div className="overflow-x-auto rounded-2xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_94%,transparent)] p-3 shadow-[0_10px_28px_rgba(12,18,34,0.12)]">
      <svg viewBox="0 0 1120 510" className="h-auto min-w-[860px] w-full" role="img" aria-label="주식 5분봉 차트">
        <rect x={x0} y={y0} width={plotW} height={plotH} rx={12} fill={palette.pricePanelBg} stroke={palette.pricePanelStroke} />
        <rect x={x0} y={volumeY0} width={plotW} height={volH} rx={10} fill={palette.volumePanelBg} stroke={palette.volumePanelStroke} />

        {Array.from({ length: 6 }).map((_, i) => {
          const ratio = i / 5;
          const y = y0 + plotH * ratio;
          const value = priceTop - (priceTop - priceBottom) * ratio;
          return (
            <g key={`grid-${i}`}>
              <line x1={x0} y1={y} x2={x0 + plotW} y2={y} stroke={palette.grid} strokeWidth={1} />
              <text x={x0 + plotW + 10} y={y + 4} fontSize={11} fill={palette.axis}>
                {Math.round(value).toLocaleString('ko-KR')}냥
              </text>
            </g>
          );
        })}

        {candles.map((candle, index) => {
          const x = x0 + index * xStep + xStep / 2;
          const up = candle.c >= candle.o;
          const color = up ? palette.up : palette.down;

          const yHigh = yAtPrice(candle.h);
          const yLow = yAtPrice(candle.l);
          const yOpen = yAtPrice(candle.o);
          const yClose = yAtPrice(candle.c);
          const bodyTop = Math.min(yOpen, yClose);
          const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));

          const volHeight = (Math.max(candle.v, 0) / maxVolume) * (volH - 14);
          const volTop = volumeY0 + volH - volHeight - 6;

          return (
            <g key={`candle-${index}`}>
              <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth={1.2} />
              <rect x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} fill={color} rx={1.2} />
              <rect
                x={x - candleWidth / 2}
                y={volTop}
                width={candleWidth}
                height={Math.max(1, volHeight)}
                fill={up ? palette.upVolume : palette.downVolume}
              />
            </g>
          );
        })}

        {(() => {
          const path = ma5
            .map((value, index) => {
              if (value == null) return null;
              const x = x0 + index * xStep + xStep / 2;
              const y = yAtPrice(value);
              return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
            })
            .filter(Boolean)
            .join(' ');
          return path ? <path d={path} fill="none" stroke={palette.maFast} strokeWidth={1.6} /> : null;
        })()}

        {(() => {
          const path = ma20
            .map((value, index) => {
              if (value == null) return null;
              const x = x0 + index * xStep + xStep / 2;
              const y = yAtPrice(value);
              return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
            })
            .filter(Boolean)
            .join(' ');
          return path ? (
            <path d={path} fill="none" stroke={palette.maSlow} strokeWidth={1.4} strokeDasharray="6 5" />
          ) : null;
        })()}

        {holdingAvgPrice != null ? (
          (() => {
            const y = yAtPrice(holdingAvgPrice);
            const labelY = Math.max(y0 + 12, Math.min(y0 + plotH - 6, y - 6));
            return (
              <g>
                <line
                  x1={x0}
                  y1={y}
                  x2={x0 + plotW}
                  y2={y}
                  stroke={palette.avgLine}
                  strokeWidth={1.4}
                  strokeDasharray="7 5"
                />
                <text x={x0 + 10} y={labelY} fontSize={11} fontWeight={700} fill={palette.avgLabel}>
                  평단 {Math.round(holdingAvgPrice).toLocaleString('ko-KR')}냥
                </text>
              </g>
            );
          })()
        ) : null}

        {candles
          .filter((_, index) => index % Math.max(1, Math.floor(candles.length / 8)) === 0)
          .map((candle, i) => {
            const index = i * Math.max(1, Math.floor(candles.length / 8));
            const x = x0 + index * xStep + xStep / 2;
            return (
              <text key={`label-${candle.t}-${i}`} x={x} y={volumeY0 + volH + 16} fontSize={10} textAnchor="middle" fill={palette.axisMuted}>
                {formatTime(candle.t)}
              </text>
            );
          })}

        <text x={x0 + 10} y={volumeY0 + 14} fontSize={11} fill={palette.axisMuted}>거래량</text>
      </svg>
    </div>
  );
}

export default function StockClient() {
  const [status, setStatus] = useState<StockDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState('1');
  const [busySide, setBusySide] = useState<'buy' | 'sell' | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastTrade, setLastTrade] = useState<TradeResult | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [pointsToNyangInput, setPointsToNyangInput] = useState('1000');
  const [nyangToPointsInput, setNyangToPointsInput] = useState('100');
  const [exchangeBusyDirection, setExchangeBusyDirection] = useState<'points_to_nyang' | 'nyang_to_points' | null>(null);
  const [exchangeNotice, setExchangeNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const requestSeqRef = useRef(0);

  const loadStatus = useCallback(async () => {
    const requestSeq = ++requestSeqRef.current;

    try {
      const res = await fetch('/api/stock/status', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`);
      }

      if (requestSeq !== requestSeqRef.current) return;

      setStatus(normalizeDashboard(body));
      setLastSyncedAt(new Date().toISOString());
      setError(null);
    } catch (e) {
      if (requestSeq !== requestSeqRef.current) return;
      setError(e instanceof Error ? e.message : '주식 정보를 불러오지 못했습니다.');
    } finally {
      if (requestSeq !== requestSeqRef.current) return;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') {
        void loadStatus();
      }
    };

    tick();
    const id = window.setInterval(tick, 15000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadStatus();
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      requestSeqRef.current += 1;
    };
  }, [loadStatus]);

  const handleManualRefresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await loadStatus();
    } finally {
      window.setTimeout(() => {
        setManualRefreshing(false);
      }, 120);
    }
  }, [loadStatus]);

  const submitTrade = useCallback(
    async (side: 'buy' | 'sell') => {
      const qty = Math.trunc(Number(qtyInput));
      if (!Number.isFinite(qty) || qty <= 0) {
        setNotice({ type: 'error', text: '수량은 1 이상의 숫자로 입력해 주세요.' });
        return;
      }

      setBusySide(side);
      setNotice(null);

      try {
        const res = await fetch('/api/stock/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ side, qty }),
        });

        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`);
        }

        const trade = (body.trade ?? {}) as Record<string, unknown>;
        setLastTrade({
          side: String(trade.side ?? side),
          qty: toSafeNumber(trade.qty),
          price: toSafeNumber(trade.price),
          gross: toSafeNumber(trade.gross),
          fee: toSafeNumber(trade.fee),
          settlement: toSafeNumber(trade.settlement),
          holdingQty: toSafeNumber(trade.holdingQty),
          holdingAvgPrice: toSafeNumber(trade.holdingAvgPrice),
        });

        if (body.dashboard) {
          setStatus(normalizeDashboard(body.dashboard));
        } else {
          await loadStatus();
        }

        setNotice({
          type: 'success',
          text: `${side === 'buy' ? '매수' : '매도'} 완료: ${qty.toLocaleString('ko-KR')}주`,
        });
      } catch (e) {
        setNotice({ type: 'error', text: e instanceof Error ? e.message : '거래에 실패했습니다.' });
      } finally {
        setBusySide(null);
      }
    },
    [qtyInput, loadStatus],
  );

  const submitExchange = useCallback(async (direction: 'points_to_nyang' | 'nyang_to_points') => {
    const rawAmount = direction === 'points_to_nyang' ? pointsToNyangInput : nyangToPointsInput;
    const amount = Math.trunc(Number(rawAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      setExchangeNotice({
        type: 'error',
        text: direction === 'points_to_nyang'
          ? '환전 포인트는 1 이상 숫자로 입력해 주세요.'
          : '환전 냥은 1 이상 숫자로 입력해 주세요.',
      });
      return;
    }

    setExchangeBusyDirection(direction);
    setExchangeNotice(null);

    try {
      const res = await fetch('/api/stock/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction, amount }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`);
      }

      if (body.dashboard) {
        setStatus(normalizeDashboard(body.dashboard));
      } else {
        await loadStatus();
      }

      const exchange = (body.exchange ?? {}) as Record<string, unknown>;
      const pointsSpent = toSafeNumber(exchange.pointsSpent, 0);
      const nyangReceived = toSafeNumber(exchange.nyangReceived, 0);
      const nyangSpent = toSafeNumber(exchange.nyangSpent, 0);
      const pointsReceived = toSafeNumber(exchange.pointsReceived, 0);
      const rate = Math.max(1, toSafeNumber(exchange.rateNyangPerPoint, 100));

      if (direction === 'points_to_nyang') {
        setExchangeNotice({
          type: 'success',
          text: `환전 완료: ${pointsSpent.toLocaleString('ko-KR')}P -> ${nyangReceived.toLocaleString('ko-KR')}냥`,
        });
      } else {
        setExchangeNotice({
          type: 'success',
          text: `환전 완료: ${nyangSpent.toLocaleString('ko-KR')}냥 -> ${pointsReceived.toLocaleString('ko-KR')}P (환율 ${rate}냥 = 1P)`,
        });
      }
    } catch (e) {
      setExchangeNotice({ type: 'error', text: e instanceof Error ? e.message : '환전에 실패했습니다.' });
    } finally {
      setExchangeBusyDirection(null);
    }
  }, [loadStatus, nyangToPointsInput, pointsToNyangInput]);

  const quickQuantities = [1, 5, 10, 50, 100, 500];

  const previewQty = Math.max(0, Math.floor(Number(qtyInput.replaceAll(',', '')) || 0));
  const unitPrice = Math.max(toSafeNumber(status?.price, 0), 1);
  const feeBps = Math.max(toSafeNumber(status?.feeBps, 150), 0);
  const buyPreview = estimateTrade('buy', previewQty, unitPrice, feeBps);
  const sellPreview = estimateTrade('sell', previewQty, unitPrice, feeBps);

  const maxAffordableQty = useMemo(() => {
    const balance = toSafeNumber(status?.balance, 0);
    if (balance <= 0) return 0;

    const naiveUpper = Math.max(Math.floor(balance / Math.max(unitPrice, 1)), 0);
    if (naiveUpper <= 0) return 0;

    let lo = 0;
    let hi = naiveUpper;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      const estimate = estimateTrade('buy', mid, unitPrice, feeBps);
      if (estimate.settlement <= balance) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }

    return lo;
  }, [feeBps, status?.balance, unitPrice]);

  const buyRatioQuantities = useMemo(() => {
    const ratios = [0.25, 0.5, 1];
    const values = ratios.map((r) => Math.max(Math.floor(maxAffordableQty * r), 0)).filter((v) => v > 0);
    return [...new Set(values)];
  }, [maxAffordableQty]);

  const sellRatioQuantities = useMemo(() => {
    const base = Math.max(toSafeNumber(status?.holdingQty, 0), 0);
    const ratios = [0.25, 0.5, 1];
    const values = ratios.map((r) => Math.max(Math.floor(base * r), 0)).filter((v) => v > 0);
    return [...new Set(values)];
  }, [status?.holdingQty]);

  const holdingDeltaPct = useMemo(() => {
    const holdingQty = toSafeNumber(status?.holdingQty, 0);
    const avg = toSafeNumber(status?.holdingAvgPrice, 0);
    const price = toSafeNumber(status?.price, 0);
    if (holdingQty <= 0 || avg <= 0 || price <= 0) return null;
    return ((price - avg) / avg) * 100;
  }, [status?.holdingAvgPrice, status?.holdingQty, status?.price]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <section className="relative overflow-hidden rounded-3xl border border-[color:color-mix(in_srgb,var(--accent-sky)_28%,var(--border))] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent-sky)_14%,var(--card)),color-mix(in_srgb,var(--accent-pink)_8%,var(--card)))] p-5 shadow-[0_22px_54px_rgba(8,12,28,0.16)] sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.20),transparent_68%)] blur-lg" />
        <div className="pointer-events-none absolute -bottom-24 -left-14 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.20),transparent_72%)] blur-lg" />

        <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-[color:color-mix(in_srgb,var(--fg)_74%,transparent)]">TRADING PANEL</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight font-bangul text-[color:var(--fg)]">{status?.displayName ?? '쿠로 주식'}</h1>
             <p className="mt-2 text-sm text-[color:color-mix(in_srgb,var(--fg)_74%,transparent)]">주식 전용 재화 냥으로 거래하고, 포인트는 환전으로만 충전해요.</p>
            <p className="mt-1 text-[11px] font-medium text-[color:color-mix(in_srgb,var(--fg)_64%,transparent)]">
              실시간 체결 반영 · 15초 자동 갱신
              {lastSyncedAt ? ` · 마지막 동기화 ${formatTime(lastSyncedAt)}` : ''}
            </p>
          </div>

          <button
            type="button"
            disabled={manualRefreshing}
            onClick={() => void handleManualRefresh()}
            className="inline-flex items-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_84%,transparent)] px-4 py-2 text-sm font-semibold text-[color:var(--fg)] transition motion-safe:hover:-translate-y-0.5 hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCcw className={`h-4 w-4 ${manualRefreshing ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_88%,transparent)] px-4 py-3 transition motion-safe:hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(8,12,28,0.12)]">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[color:color-mix(in_srgb,var(--fg)_70%,transparent)]"><CandlestickChart className="h-3.5 w-3.5" />현재가</p>
            <p className="mt-1 text-xl font-black text-[color:var(--fg)]">{status ? `${status.price.toLocaleString('ko-KR')}냥` : '...'}</p>
            <p className={`mt-1 text-xs font-semibold ${status && status.changePct >= 0 ? 'text-[#e11d48] dark:text-[#fb7185]' : 'text-[#2563eb] dark:text-[#7dd3fc]'}`}>
              {status ? signedPct(status.changePct) : '-'}
            </p>
          </div>

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_88%,transparent)] px-4 py-3 transition motion-safe:hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(8,12,28,0.12)]">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[color:color-mix(in_srgb,var(--fg)_70%,transparent)]"><Coins className="h-3.5 w-3.5" />보유 냥</p>
            <p className="mt-1 text-xl font-black text-[color:var(--fg)]">{status ? `${status.balance.toLocaleString('ko-KR')}냥` : '...'}</p>
            <p className="mt-1 text-xs text-[color:color-mix(in_srgb,var(--fg)_68%,transparent)]">포인트 {status ? `${status.pointBalance.toLocaleString('ko-KR')}P` : '...'} · 수수료 {(toSafeNumber(status?.feeBps, 150) / 100).toFixed(2)}%</p>
          </div>

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_88%,transparent)] px-4 py-3 transition motion-safe:hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(8,12,28,0.12)]">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[color:color-mix(in_srgb,var(--fg)_70%,transparent)]"><Wallet className="h-3.5 w-3.5" />보유 수량</p>
            <p className="mt-1 text-xl font-black text-[color:var(--fg)]">{status ? `${status.holdingQty.toLocaleString('ko-KR')}주` : '...'}</p>
            <p className="mt-1 text-xs text-[color:color-mix(in_srgb,var(--fg)_68%,transparent)]">평단 {status ? `${status.holdingAvgPrice.toLocaleString('ko-KR')}냥` : '-'}</p>
            {holdingDeltaPct != null ? (
              <p className={`mt-1 text-xs font-semibold ${holdingDeltaPct >= 0 ? 'text-[#e11d48] dark:text-[#fb7185]' : 'text-[#2563eb] dark:text-[#7dd3fc]'}`}>
                평단 대비 {signedPct(holdingDeltaPct)}
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_88%,transparent)] px-4 py-3 transition motion-safe:hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(8,12,28,0.12)]">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[color:color-mix(in_srgb,var(--fg)_70%,transparent)]"><ArrowUpDown className="h-3.5 w-3.5" />평가손익</p>
            <p className={`mt-1 text-xl font-black ${status && status.unrealizedPnl >= 0 ? 'text-[#e11d48] dark:text-[#fb7185]' : 'text-[#2563eb] dark:text-[#7dd3fc]'}`}>
              {status ? `${signed(status.unrealizedPnl)}냥` : '...'}
            </p>
            <p className="mt-1 text-xs text-[color:color-mix(in_srgb,var(--fg)_68%,transparent)]">평가금액 {status ? `${status.holdingValue.toLocaleString('ko-KR')}냥` : '-'}</p>
          </div>
        </div>

        <div className="mt-5">
          <StockChart status={status} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.18fr,0.82fr]">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_90%,transparent)] p-4 transition motion-safe:hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(8,12,28,0.12)]">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-[color:var(--muted)]" />
              <p className="text-sm font-semibold text-[color:var(--fg)]">거래</p>
            </div>

            <div className="mt-3 rounded-2xl border border-[color:color-mix(in_srgb,var(--accent-sky)_30%,var(--border))] bg-[linear-gradient(140deg,color-mix(in_srgb,var(--accent-sky)_10%,var(--card)),color-mix(in_srgb,var(--accent-pink)_6%,var(--card)))] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-[color:var(--fg)]">환전소</p>
                  <p className="text-[11px] text-[color:color-mix(in_srgb,var(--fg)_66%,transparent)]">
                    포인트 {'->'} 냥: 1P = 1냥 · 냥 {'->'} 포인트: 100냥 = 1P
                  </p>
                </div>
                <p className="text-[11px] font-semibold text-[color:color-mix(in_srgb,var(--fg)_68%,transparent)]">
                  포인트 {toSafeNumber(status?.pointBalance, 0).toLocaleString('ko-KR')}P · 냥 {toSafeNumber(status?.balance, 0).toLocaleString('ko-KR')}냥
                </p>
              </div>

              <div className="mt-2 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={pointsToNyangInput}
                    onChange={(e) => setPointsToNyangInput(e.target.value.replace(/[^0-9]/g, ''))}
                    className="h-10 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)] px-3 text-sm font-semibold text-[color:var(--fg)] outline-none focus:border-[color:var(--accent-sky)] sm:min-w-0 sm:flex-1 sm:w-auto"
                    placeholder="포인트 -> 냥"
                  />
                  <button
                    type="button"
                    disabled={exchangeBusyDirection !== null || loading}
                    onClick={() => void submitExchange('points_to_nyang')}
                    className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-xl bg-[color:var(--accent-sky)] px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {exchangeBusyDirection === 'points_to_nyang' ? '환전 중...' : 'P -> 냥'}
                  </button>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={nyangToPointsInput}
                    onChange={(e) => setNyangToPointsInput(e.target.value.replace(/[^0-9]/g, ''))}
                    className="h-10 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)] px-3 text-sm font-semibold text-[color:var(--fg)] outline-none focus:border-[color:var(--accent-sky)] sm:min-w-0 sm:flex-1 sm:w-auto"
                    placeholder="냥 -> 포인트 (100냥 단위)"
                  />
                  <button
                    type="button"
                    disabled={exchangeBusyDirection !== null || loading}
                    onClick={() => void submitExchange('nyang_to_points')}
                    className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-xl bg-[color:var(--accent-pink)] px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {exchangeBusyDirection === 'nyang_to_points' ? '환전 중...' : '냥 -> P'}
                  </button>
                </div>
              </div>

              {exchangeNotice ? (
                <p className={`mt-2 text-xs font-semibold ${exchangeNotice.type === 'success' ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                  {exchangeNotice.text}
                </p>
              ) : null}
            </div>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="text-sm font-semibold text-[color:color-mix(in_srgb,var(--fg)_70%,transparent)]" htmlFor="stock-qty">
                수량
              </label>
              <input
                id="stock-qty"
                inputMode="numeric"
                pattern="[0-9]*"
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value.replace(/[^0-9]/g, ''))}
                className="h-10 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)] px-3 text-sm font-semibold text-[color:var(--fg)] outline-none focus:border-[color:var(--accent-sky)] sm:max-w-[180px]"
              />
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {quickQuantities.map((qty) => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => setQtyInput(String(qty))}
                      className="rounded-full border border-[color:var(--border)] bg-[color:var(--chip)] px-2.5 py-1 text-xs font-semibold text-[color:var(--fg)] transition hover:brightness-105"
                    >
                      {qty}주
                    </button>
                  ))}
                </div>

                <div className="grid gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_84%,transparent)] p-2.5">
                  <div>
                    <p className="text-[10px] font-semibold tracking-[0.08em] text-[color:color-mix(in_srgb,var(--fg)_64%,transparent)]">잔고 기반 빠른 매수</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {buyRatioQuantities.length > 0 ? (
                        buyRatioQuantities.map((qty) => (
                          <button
                            key={`buy-${qty}`}
                            type="button"
                            onClick={() => setQtyInput(String(qty))}
                            className="rounded-full border border-[color:color-mix(in_srgb,#ef4444_35%,var(--border))] bg-[color:color-mix(in_srgb,#ef4444_10%,transparent)] px-2.5 py-1 text-[11px] font-semibold text-[#dc2626] transition hover:brightness-105 dark:text-[#fb7185]"
                          >
                            {qty}주
                          </button>
                        ))
                      ) : (
                        <span className="text-[11px] text-[color:color-mix(in_srgb,var(--fg)_58%,transparent)]">잔고 부족</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold tracking-[0.08em] text-[color:color-mix(in_srgb,var(--fg)_64%,transparent)]">보유 기반 빠른 매도</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {sellRatioQuantities.length > 0 ? (
                        sellRatioQuantities.map((qty) => (
                          <button
                            key={`sell-${qty}`}
                            type="button"
                            onClick={() => setQtyInput(String(qty))}
                            className="rounded-full border border-[color:color-mix(in_srgb,#2563eb_35%,var(--border))] bg-[color:color-mix(in_srgb,#2563eb_10%,transparent)] px-2.5 py-1 text-[11px] font-semibold text-[#1d4ed8] transition hover:brightness-105 dark:text-[#7dd3fc]"
                          >
                            {qty}주
                          </button>
                        ))
                      ) : (
                        <span className="text-[11px] text-[color:color-mix(in_srgb,var(--fg)_58%,transparent)]">보유 수량 없음</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,#ef4444_8%,var(--card))] px-3 py-2">
                  <p className="text-[10px] font-semibold tracking-[0.08em] text-[color:color-mix(in_srgb,var(--fg)_64%,transparent)]">매수 예상</p>
                    <p className="mt-1 text-sm font-semibold text-[color:var(--fg)]">총 {buyPreview.settlement.toLocaleString('ko-KR')}냥</p>
                    <p className="text-[11px] text-[color:color-mix(in_srgb,var(--fg)_62%,transparent)]">
                      체결가 {buyPreview.execPrice.toLocaleString('ko-KR')}냥 · 수수료 {buyPreview.fee.toLocaleString('ko-KR')}냥
                    </p>
                  </div>
                  <div className="rounded-xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,#2563eb_8%,var(--card))] px-3 py-2">
                    <p className="text-[10px] font-semibold tracking-[0.08em] text-[color:color-mix(in_srgb,var(--fg)_64%,transparent)]">매도 예상</p>
                    <p className="mt-1 text-sm font-semibold text-[color:var(--fg)]">순수령 {sellPreview.settlement.toLocaleString('ko-KR')}냥</p>
                    <p className="text-[11px] text-[color:color-mix(in_srgb,var(--fg)_62%,transparent)]">
                      체결가 {sellPreview.execPrice.toLocaleString('ko-KR')}냥 · 수수료 {sellPreview.fee.toLocaleString('ko-KR')}냥
                    </p>
                  </div>
                </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={loading || busySide !== null}
                onClick={() => void submitTrade('buy')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#ef4444] px-4 py-2.5 text-sm font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CandlestickChart className="h-4 w-4" />
                {busySide === 'buy' ? '매수 중...' : '매수'}
              </button>
              <button
                type="button"
                disabled={loading || busySide !== null}
                onClick={() => void submitTrade('sell')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#3b82f6] px-4 py-2.5 text-sm font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CandlestickChart className="h-4 w-4" />
                {busySide === 'sell' ? '매도 중...' : '매도'}
              </button>
            </div>

            {notice ? (
              <p className={`mt-3 text-sm font-semibold ${notice.type === 'success' ? 'text-[#22c55e]' : 'text-[#f87171]'}`}>
                {notice.text}
              </p>
            ) : null}
            {error ? <p className="mt-3 text-sm font-semibold text-[#f87171]">{error}</p> : null}
          </div>

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_90%,transparent)] p-4 transition motion-safe:hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(8,12,28,0.12)]">
            <p className="text-sm font-semibold text-[color:var(--fg)]">최근 거래</p>
            {lastTrade ? (
              <div className="mt-3 space-y-2 text-sm text-[color:var(--fg)]">
                <p>
                  타입: <span className="font-black">{lastTrade.side === 'buy' ? '매수' : '매도'}</span>
                </p>
                <p>
                  수량: <span className="font-black">{lastTrade.qty.toLocaleString('ko-KR')}주</span>
                </p>
                <p>
                  단가: <span className="font-black">{lastTrade.price.toLocaleString('ko-KR')}냥</span>
                </p>
                <p>
                  보유 수량: <span className="font-black">{lastTrade.holdingQty.toLocaleString('ko-KR')}주</span>
                </p>
                <p>
                  현재 평단: <span className="font-black">{lastTrade.holdingAvgPrice.toLocaleString('ko-KR')}냥</span>
                </p>
                <p>
                  거래금액: <span className="font-black">{lastTrade.gross.toLocaleString('ko-KR')}냥</span>
                </p>
                <p>
                  수수료: <span className="font-black">{lastTrade.fee.toLocaleString('ko-KR')}냥</span>
                </p>
                <p>
                  정산: <span className="font-black">{lastTrade.settlement.toLocaleString('ko-KR')}냥</span>
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[color:color-mix(in_srgb,var(--fg)_68%,transparent)]">아직 거래 기록이 없어요.</p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/draw" className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-xs font-semibold text-[color:var(--fg)]">
                <Coins className="h-3.5 w-3.5" />
                뽑기
              </Link>
              <Link href="/me" className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-xs font-semibold text-[color:var(--fg)]">
                <Wallet className="h-3.5 w-3.5" />
                내 정보
              </Link>
            </div>
          </div>
        </div>
        </div>
      </section>
    </main>
  );
}
