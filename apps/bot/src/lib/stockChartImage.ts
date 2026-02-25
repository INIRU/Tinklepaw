import { AttachmentBuilder } from 'discord.js';
import { createCanvas, registerFont, type CanvasRenderingContext2D } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const safeRegisterFont = (src: string, options: Parameters<typeof registerFont>[1]) => {
  try {
    registerFont(src, options);
  } catch {}
};

const pretendardPath = path.resolve(__dirname, '../assets/fonts/Pretendard-Regular.ttf');
const notoKRPath = path.resolve(__dirname, '../assets/fonts/NotoSansKR-Regular.ttf');

if (fs.existsSync(pretendardPath)) {
  safeRegisterFont(pretendardPath, { family: 'Pretendard', weight: '400' });
  safeRegisterFont(pretendardPath, { family: 'Pretendard', weight: '700' });
}
if (fs.existsSync(notoKRPath)) {
  safeRegisterFont(notoKRPath, { family: 'Noto Sans KR', weight: '400' });
}

const FONT = 'Pretendard, "Noto Sans KR", sans-serif';

type StockCandle = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

const WIDTH = 1280;
const HEIGHT = 760;

const PAD = {
  top: 98,
  right: 98,
  bottom: 66,
  left: 86,
};

const VOLUME_HEIGHT = 130;
const PANEL_GAP = 18;

const UP_COLOR = '#ef4444';
const DOWN_COLOR = '#3b82f6';
const AVG_COLOR = 'rgba(45,212,191,0.95)';
const GRID_COLOR = 'rgba(148,163,184,0.18)';
const CANDLE_WINDOW = 72;
const FIVE_MINUTE_MS = 5 * 60 * 1000;

function fallbackCandles(currentPrice: number): StockCandle[] {
  const safe = Math.max(100, currentPrice);
  return Array.from({ length: CANDLE_WINDOW }).map((_, idx) => {
    const ts = new Date(Date.now() - (CANDLE_WINDOW - 1 - idx) * FIVE_MINUTE_MS).toISOString();
    return { t: ts, o: safe, h: safe, l: safe, c: safe, v: 0 };
  });
}

function normalizeCandles(candles: StockCandle[], currentPrice: number): StockCandle[] {
  const recent = [...candles]
    .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())
    .slice(-CANDLE_WINDOW);

  if (recent.length === 0) {
    return fallbackCandles(currentPrice);
  }

  if (recent.length >= CANDLE_WINDOW) {
    return recent;
  }

  const missing = CANDLE_WINDOW - recent.length;
  const base = Math.max(1, recent[0].o || recent[0].c || currentPrice || 100);
  const firstTs = new Date(recent[0].t).getTime();
  const startTs = Number.isNaN(firstTs)
    ? Date.now() - (CANDLE_WINDOW - 1) * FIVE_MINUTE_MS
    : firstTs - missing * FIVE_MINUTE_MS;

  const padded = Array.from({ length: missing }).map((_, idx) => {
    const ts = new Date(startTs + idx * FIVE_MINUTE_MS).toISOString();
    return { t: ts, o: base, h: base, l: base, c: base, v: 0 };
  });

  return [...padded, ...recent];
}

function movingAverage(candles: StockCandle[], windowSize: number): Array<number | null> {
  const result: Array<number | null> = [];
  let sum = 0;

  for (let i = 0; i < candles.length; i += 1) {
    sum += candles[i].c;
    if (i >= windowSize) {
      sum -= candles[i - windowSize].c;
    }

    if (i < windowSize - 1) {
      result.push(null);
    } else {
      result.push(sum / windowSize);
    }
  }

  return result;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, '#070d17');
  bg.addColorStop(1, '#0f172a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Blue glow top-left
  const glowA = ctx.createRadialGradient(210, 80, 20, 210, 80, 260);
  glowA.addColorStop(0, 'rgba(59,130,246,0.17)');
  glowA.addColorStop(1, 'rgba(59,130,246,0)');
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Red glow bottom-right
  const glowB = ctx.createRadialGradient(WIDTH - 160, HEIGHT - 100, 24, WIDTH - 160, HEIGHT - 100, 300);
  glowB.addColorStop(0, 'rgba(239,68,68,0.15)');
  glowB.addColorStop(1, 'rgba(239,68,68,0)');
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Pink glow top-center
  const glowC = ctx.createRadialGradient(WIDTH / 2, 0, 10, WIDTH / 2, 0, 320);
  glowC.addColorStop(0, 'rgba(255,95,162,0.13)');
  glowC.addColorStop(1, 'rgba(255,95,162,0)');
  ctx.fillStyle = glowC;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDateTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function drawLineSeries(
  ctx: CanvasRenderingContext2D,
  values: Array<number | null>,
  xAt: (index: number) => number,
  yAt: (price: number) => number,
  color: string,
  width: number,
  dashed = false,
) {
  ctx.beginPath();
  let started = false;

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value == null) continue;
    const x = xAt(i);
    const y = yAt(value);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }

  if (!started) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dashed ? [7, 6] : []);
  ctx.stroke();
  ctx.setLineDash([]);
}

export async function generateStockChartImage(params: {
  title: string;
  symbol: string;
  currentPrice: number;
  changePct: number;
  candles: StockCandle[];
  holdingAvgPrice?: number;
}) {
  const realCandles = [...params.candles]
    .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())
    .slice(-CANDLE_WINDOW);
  const candles = normalizeCandles(realCandles, params.currentPrice);
  const holdingAvgPrice =
    typeof params.holdingAvgPrice === 'number' && Number.isFinite(params.holdingAvgPrice) && params.holdingAvgPrice > 0
      ? params.holdingAvgPrice
      : null;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx);

  const priceX = PAD.left;
  const priceY = PAD.top;
  const priceW = WIDTH - PAD.left - PAD.right;
  const priceH = HEIGHT - PAD.top - PAD.bottom - VOLUME_HEIGHT - PANEL_GAP;

  const volumeX = PAD.left;
  const volumeY = priceY + priceH + PANEL_GAP;
  const volumeW = priceW;
  const volumeH = VOLUME_HEIGHT;

  drawRoundedRect(ctx, priceX, priceY, priceW, priceH, 14);
  ctx.fillStyle = 'rgba(15,23,42,0.76)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.22)';
  ctx.lineWidth = 1;
  ctx.stroke();

  drawRoundedRect(ctx, volumeX, volumeY, volumeW, volumeH, 14);
  ctx.fillStyle = 'rgba(15,23,42,0.66)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.17)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);
  if (holdingAvgPrice != null) {
    highs.push(holdingAvgPrice);
    lows.push(holdingAvgPrice);
  }
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const pad = Math.max(16, (maxHigh - minLow) * 0.08);
  const topPrice = maxHigh + pad;
  const bottomPrice = Math.max(1, minLow - pad);
  const range = Math.max(1, topPrice - bottomPrice);

  const yAtPrice = (price: number) => priceY + ((topPrice - price) / range) * priceH;

  const xStep = priceW / Math.max(candles.length, 1);
  const xAt = (index: number) => priceX + xStep * index + xStep / 2;

  ctx.font = `12px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  for (let i = 0; i <= 6; i += 1) {
    const ratio = i / 6;
    const y = priceY + priceH * ratio;
    const value = topPrice - range * ratio;

    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(priceX, y);
    ctx.lineTo(priceX + priceW, y);
    ctx.stroke();

    ctx.fillStyle = 'rgba(226,232,240,0.78)';
    ctx.fillText(`${Math.round(value).toLocaleString()}P`, priceX + priceW + 10, y);
  }

  const labelEvery = Math.max(1, Math.floor(candles.length / 9));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `11px ${FONT}`;

  for (let i = 0; i < candles.length; i += labelEvery) {
    const x = xAt(i);
    ctx.strokeStyle = 'rgba(148,163,184,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, priceY);
    ctx.lineTo(x, priceY + priceH);
    ctx.stroke();

    ctx.fillStyle = 'rgba(226,232,240,0.72)';
    ctx.fillText(formatTime(candles[i].t), x, volumeY + volumeH + 12);
  }

  const candleWidth = Math.max(7, Math.min(20, xStep * 0.9));

  // Area fill under closing price line (subtle)
  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i];
    const x = xAt(i);
    const yClose = yAtPrice(c.c);
    const isUp = c.c >= c.o;
    const areaGrad = ctx.createLinearGradient(x, yClose, x, priceY + priceH);
    if (isUp) {
      areaGrad.addColorStop(0, 'rgba(239,68,68,0.06)');
      areaGrad.addColorStop(1, 'rgba(239,68,68,0)');
    } else {
      areaGrad.addColorStop(0, 'rgba(59,130,246,0.06)');
      areaGrad.addColorStop(1, 'rgba(59,130,246,0)');
    }
    ctx.fillStyle = areaGrad;
    ctx.fillRect(x - xStep / 2, yClose, xStep, priceY + priceH - yClose);
  }

  // Candles
  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i];
    const x = xAt(i);

    const yHigh = yAtPrice(c.h);
    const yLow = yAtPrice(c.l);
    const yOpen = yAtPrice(c.o);
    const yClose = yAtPrice(c.c);
    const isUp = c.c >= c.o;
    const color = isUp ? UP_COLOR : DOWN_COLOR;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();

    const bodyTop = Math.min(yOpen, yClose);
    const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));
    ctx.fillStyle = color;
    ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
  }

  const ma5 = movingAverage(candles, 5);
  const ma20 = movingAverage(candles, 20);
  drawLineSeries(ctx, ma5, xAt, yAtPrice, 'rgba(250,204,21,0.92)', 1.8, false);
  drawLineSeries(ctx, ma20, xAt, yAtPrice, 'rgba(248,250,252,0.78)', 1.8, true);

  // MA legend — top-right inside price panel
  const legendX = priceX + priceW - 110;
  const legendY = priceY + 14;
  ctx.font = `600 11px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  // MA5 dot
  ctx.fillStyle = 'rgba(250,204,21,0.92)';
  ctx.beginPath();
  ctx.arc(legendX, legendY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(226,232,240,0.80)';
  ctx.fillText('MA5', legendX + 10, legendY);
  // MA20 dot (dashed indicator)
  ctx.fillStyle = 'rgba(248,250,252,0.78)';
  ctx.beginPath();
  ctx.arc(legendX + 56, legendY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(248,250,252,0.78)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(legendX + 52, legendY);
  ctx.lineTo(legendX + 60, legendY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(226,232,240,0.80)';
  ctx.fillText('MA20', legendX + 66, legendY);

  // Volume bars with gradient fade at top
  const maxVolume = Math.max(1, ...candles.map((c) => c.v));
  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i];
    const x = xAt(i);
    const isUp = c.c >= c.o;

    const h = (Math.max(0, c.v) / maxVolume) * (volumeH - 24);
    const y = volumeY + volumeH - h - 8;

    const volGrad = ctx.createLinearGradient(x, y, x, y + h);
    if (isUp) {
      volGrad.addColorStop(0, 'rgba(239,68,68,0.28)');
      volGrad.addColorStop(1, 'rgba(239,68,68,0.55)');
    } else {
      volGrad.addColorStop(0, 'rgba(59,130,246,0.28)');
      volGrad.addColorStop(1, 'rgba(59,130,246,0.55)');
    }
    ctx.fillStyle = volGrad;
    ctx.fillRect(x - candleWidth / 2, y, candleWidth, h);
  }

  ctx.font = `11px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(203,213,225,0.82)';
  ctx.fillText('거래량', volumeX + 10, volumeY + 16);

  const last = realCandles[realCandles.length - 1] ?? candles[candles.length - 1];
  const first = realCandles[0] ?? candles[0];

  const lastY = yAtPrice(last.c);
  ctx.strokeStyle = 'rgba(250,204,21,0.72)';
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(priceX, lastY);
  ctx.lineTo(priceX + priceW, lastY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Current price pill on right y-axis edge
  const isUpTrend = params.changePct >= 0;
  const pillColor = isUpTrend ? 'rgba(239,68,68,0.85)' : 'rgba(59,130,246,0.85)';
  const pillText = `현재가 ${last.c.toLocaleString()}P`;
  ctx.font = `700 11px ${FONT}`;
  ctx.textBaseline = 'middle';
  const pillTextW = ctx.measureText(pillText).width;
  const pillW = pillTextW + 18;
  const pillH = 20;
  const pillX = priceX + 8;
  const pillY = Math.max(priceY + pillH / 2 + 4, Math.min(priceY + priceH - pillH / 2 - 4, lastY));
  drawRoundedRect(ctx, pillX, pillY - pillH / 2, pillW, pillH, 6);
  ctx.fillStyle = pillColor;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(pillText, pillX + 9, pillY);

  if (holdingAvgPrice != null) {
    const avgY = yAtPrice(holdingAvgPrice);
    ctx.strokeStyle = AVG_COLOR;
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(priceX, avgY);
    ctx.lineTo(priceX + priceW, avgY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = AVG_COLOR;
    ctx.font = `700 11px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `평단 ${Math.round(holdingAvgPrice).toLocaleString()}P`,
      priceX + 10,
      Math.max(priceY + 30, Math.min(priceY + priceH - 8, avgY - 8)),
    );
  }

  const trendColor = params.changePct >= 0 ? UP_COLOR : DOWN_COLOR;
  const changePctSign = params.changePct >= 0 ? '+' : '';

  // Header: title (bigger/bolder)
  ctx.fillStyle = '#f8fafc';
  ctx.font = `700 36px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${params.title} (${params.symbol})`, 34, 54);

  // Change badge (pill)
  const badgeText = `${changePctSign}${params.changePct.toFixed(2)}%`;
  ctx.font = `700 13px ${FONT}`;
  const badgeTextW = ctx.measureText(badgeText).width;
  const badgeW = badgeTextW + 20;
  const badgeH = 22;
  const badgeX = 36;
  const badgeBaseY = 66;
  drawRoundedRect(ctx, badgeX, badgeBaseY, badgeW, badgeH, 7);
  ctx.fillStyle = isUpTrend ? 'rgba(239,68,68,0.82)' : 'rgba(59,130,246,0.82)';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, badgeX + 10, badgeBaseY + badgeH / 2);

  // Subtitle line
  ctx.font = `500 13px ${FONT}`;
  ctx.fillStyle = 'rgba(226,232,240,0.72)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    `현재가 ${params.currentPrice.toLocaleString()}P  ·  5분봉 ${Math.max(realCandles.length, 1)}개`,
    badgeX + badgeW + 12,
    badgeBaseY + badgeH / 2,
  );

  // Period info right-aligned
  ctx.font = `500 11px ${FONT}`;
  ctx.fillStyle = 'rgba(226,232,240,0.60)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(`기간 ${formatDateTime(first.t)} ~ ${formatDateTime(last.t)}`, WIDTH - 14, badgeBaseY + badgeH / 2);

  // OHLC pill card
  const ohlcText = `O ${last.o.toLocaleString()}  H ${last.h.toLocaleString()}  L ${last.l.toLocaleString()}  C ${last.c.toLocaleString()}`;
  ctx.font = `600 12px ${FONT}`;
  const ohlcTextW = ctx.measureText(ohlcText).width;
  const ohlcCardW = ohlcTextW + 28;
  const ohlcCardH = 24;
  const ohlcCardX = WIDTH - PAD.right - ohlcCardW - 4;
  const ohlcCardY = priceY - ohlcCardH - 8;
  drawRoundedRect(ctx, ohlcCardX, ohlcCardY, ohlcCardW, ohlcCardH, 8);
  ctx.fillStyle = 'rgba(15,23,42,0.72)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.28)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, ohlcCardX, ohlcCardY, ohlcCardW, ohlcCardH, 8);
  ctx.stroke();
  ctx.fillStyle = 'rgba(226,232,240,0.9)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(ohlcText, ohlcCardX + 14, ohlcCardY + ohlcCardH / 2);

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'stock-chart.png' });
}
