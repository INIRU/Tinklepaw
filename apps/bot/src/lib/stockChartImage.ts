import { AttachmentBuilder } from 'discord.js';
import { createCanvas, registerFont, type CanvasRenderingContext2D } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fontPath = path.resolve(__dirname, '../assets/fonts/NotoSansKR-Regular.ttf');
if (fs.existsSync(fontPath)) {
  try {
    registerFont(fontPath, { family: 'Noto Sans KR' });
  } catch {}
}

type StockCandle = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
};

const WIDTH = 1200;
const HEIGHT = 680;

const MARGIN = {
  top: 110,
  right: 34,
  bottom: 92,
  left: 98,
};

function timeLabel(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function movingAverage(candles: StockCandle[], windowSize: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const start = Math.max(0, i - windowSize + 1);
    const slice = candles.slice(start, i + 1);
    const sum = slice.reduce((acc, cur) => acc + cur.c, 0);
    result.push(sum / slice.length);
  }
  return result;
}

function fallbackCandles(currentPrice: number): StockCandle[] {
  const safePrice = Math.max(100, currentPrice);
  return Array.from({ length: 24 }).map((_, idx) => {
    const ts = new Date(Date.now() - (23 - idx) * 5 * 60 * 1000).toISOString();
    return {
      t: ts,
      o: safePrice,
      h: safePrice,
      l: safePrice,
      c: safePrice,
    };
  });
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
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, '#060d1a');
  gradient.addColorStop(1, '#0f1a2e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glowA = ctx.createRadialGradient(180, 90, 20, 180, 90, 260);
  glowA.addColorStop(0, 'rgba(56,189,248,0.22)');
  glowA.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glowB = ctx.createRadialGradient(WIDTH - 130, HEIGHT - 80, 20, WIDTH - 130, HEIGHT - 80, 280);
  glowB.addColorStop(0, 'rgba(244,114,182,0.2)');
  glowB.addColorStop(1, 'rgba(244,114,182,0)');
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

export async function generateStockChartImage(params: {
  title: string;
  symbol: string;
  currentPrice: number;
  changePct: number;
  candles: StockCandle[];
}) {
  const candles = params.candles.length > 0 ? params.candles : fallbackCandles(params.currentPrice);

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx);

  const plotX = MARGIN.left;
  const plotY = MARGIN.top;
  const plotW = WIDTH - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;

  drawRoundedRect(ctx, plotX, plotY, plotW, plotH, 18);
  ctx.fillStyle = 'rgba(15,23,42,0.72)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);
  const maxPrice = Math.max(...highs);
  const minPrice = Math.min(...lows);
  const rangeRaw = maxPrice - minPrice;
  const rangePad = Math.max(40, rangeRaw * 0.08);
  const priceTop = maxPrice + rangePad;
  const priceBottom = Math.max(1, minPrice - rangePad);
  const priceRange = Math.max(1, priceTop - priceBottom);

  const yFromPrice = (price: number) => plotY + ((priceTop - price) / priceRange) * plotH;

  const yTicks = 6;
  ctx.font = "12px 'Noto Sans KR', sans-serif";
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let i = 0; i <= yTicks; i += 1) {
    const ratio = i / yTicks;
    const price = priceTop - priceRange * ratio;
    const y = plotY + plotH * ratio;

    ctx.strokeStyle = 'rgba(148,163,184,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotX, y);
    ctx.lineTo(plotX + plotW, y);
    ctx.stroke();

    ctx.fillStyle = 'rgba(226,232,240,0.78)';
    ctx.fillText(`${Math.round(price).toLocaleString()}P`, plotX - 12, y);
  }

  const xStep = plotW / candles.length;
  const candleWidth = Math.max(5, Math.min(16, xStep * 0.64));
  const axisY = plotY + plotH;

  const labelCount = Math.min(8, candles.length);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = "11px 'Noto Sans KR', sans-serif";

  for (let i = 0; i < labelCount; i += 1) {
    const idx = Math.min(
      candles.length - 1,
      Math.round((i * (candles.length - 1)) / Math.max(1, labelCount - 1)),
    );
    const x = plotX + idx * xStep + xStep / 2;
    const label = timeLabel(candles[idx]?.t ?? '');

    ctx.strokeStyle = 'rgba(148,163,184,0.1)';
    ctx.beginPath();
    ctx.moveTo(x, plotY);
    ctx.lineTo(x, plotY + plotH);
    ctx.stroke();

    ctx.fillStyle = 'rgba(226,232,240,0.68)';
    ctx.fillText(label, x, axisY + 12);
  }

  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i];
    const x = plotX + i * xStep + xStep / 2;

    const yHigh = yFromPrice(candle.h);
    const yLow = yFromPrice(candle.l);
    const yOpen = yFromPrice(candle.o);
    const yClose = yFromPrice(candle.c);

    const up = candle.c >= candle.o;
    const color = up ? '#22c55e' : '#ef4444';
    const border = up ? '#86efac' : '#fca5a5';

    ctx.strokeStyle = 'rgba(203,213,225,0.82)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();

    const bodyTop = Math.min(yOpen, yClose);
    const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));

    ctx.fillStyle = color;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
    ctx.strokeRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
  }

  const ma = movingAverage(candles, 6);
  ctx.strokeStyle = 'rgba(248,250,252,0.76)';
  ctx.setLineDash([7, 7]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < ma.length; i += 1) {
    const x = plotX + i * xStep + xStep / 2;
    const y = yFromPrice(ma[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  const trendUp = params.changePct >= 0;
  const trendColor = trendUp ? '#93c5fd' : '#fca5a5';

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f8fafc';
  ctx.font = "700 34px 'Noto Sans KR', sans-serif";
  ctx.fillText(`${params.title} (${params.symbol})`, 38, 52);

  ctx.font = "600 17px 'Noto Sans KR', sans-serif";
  ctx.fillStyle = trendColor;
  ctx.fillText(
    `현재가 ${params.currentPrice.toLocaleString()}P  ·  변동 ${params.changePct >= 0 ? '+' : ''}${params.changePct.toFixed(2)}%`,
    40,
    84,
  );

  ctx.font = "600 13px 'Noto Sans KR', sans-serif";
  ctx.fillStyle = 'rgba(226,232,240,0.9)';
  ctx.fillText('캔들(5분 봉)', WIDTH - 200, 50);
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  ctx.moveTo(WIDTH - 205, 72);
  ctx.lineTo(WIDTH - 128, 72);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillText('이동 평균(6)', WIDTH - 200, 86);

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'stock-chart.png' });
}
