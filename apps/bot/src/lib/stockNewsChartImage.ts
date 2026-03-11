import { AttachmentBuilder } from 'discord.js';
import { createCanvas } from 'canvas';

type StockCandle = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

const WIDTH = 640;
const HEIGHT = 200;
const PAD = { top: 32, right: 80, bottom: 24, left: 80 };
const UP_COLOR = '#ef4444';
const DOWN_COLOR = '#3b82f6';
const FONT = 'Pretendard, "Noto Sans KR", sans-serif';

export async function generateNewsChartImage(params: {
  candles: StockCandle[];
  priceBefore: number;
  priceAfter: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
}): Promise<AttachmentBuilder> {
  const candles = [...params.candles]
    .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())
    .slice(-12);

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, '#070d17');
  bg.addColorStop(1, '#0f172a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Subtle glow
  const glow = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 10, WIDTH / 2, HEIGHT / 2, 200);
  const glowColor =
    params.sentiment === 'bullish'
      ? 'rgba(239,68,68,0.10)'
      : params.sentiment === 'bearish'
        ? 'rgba(59,130,246,0.10)'
        : 'rgba(148,163,184,0.08)';
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (candles.length === 0) {
    ctx.fillStyle = 'rgba(226,232,240,0.5)';
    ctx.font = `500 14px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('차트 데이터 없음', WIDTH / 2, HEIGHT / 2);
    const buffer = canvas.toBuffer('image/png');
    return new AttachmentBuilder(buffer, { name: 'news-chart.png' });
  }

  // Price range
  const allPrices = candles.flatMap((c) => [c.h, c.l]);
  allPrices.push(params.priceBefore, params.priceAfter);
  const maxP = Math.max(...allPrices);
  const minP = Math.min(...allPrices);
  const pad = Math.max(8, (maxP - minP) * 0.1);
  const top = maxP + pad;
  const bottom = Math.max(1, minP - pad);
  const range = Math.max(1, top - bottom);

  const chartW = WIDTH - PAD.left - PAD.right;
  const chartH = HEIGHT - PAD.top - PAD.bottom;
  const xStep = chartW / Math.max(candles.length, 1);
  const xAt = (i: number) => PAD.left + xStep * i + xStep / 2;
  const yAt = (p: number) => PAD.top + ((top - p) / range) * chartH;

  // Grid (2 horizontal lines)
  ctx.strokeStyle = 'rgba(148,163,184,0.15)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 2; i++) {
    const y = PAD.top + (chartH * i) / 3;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(WIDTH - PAD.right, y);
    ctx.stroke();
  }

  // Candles
  const candleW = Math.max(5, Math.min(16, xStep * 0.7));
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const x = xAt(i);
    const isUp = c.c >= c.o;
    const color = isUp ? UP_COLOR : DOWN_COLOR;

    // Wick
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, yAt(c.h));
    ctx.lineTo(x, yAt(c.l));
    ctx.stroke();

    // Body
    const bodyTop = Math.min(yAt(c.o), yAt(c.c));
    const bodyH = Math.max(2, Math.abs(yAt(c.c) - yAt(c.o)));
    ctx.fillStyle = color;
    ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
  }

  // Impact vertical line (after last candle)
  const impactX = xAt(candles.length - 1) + xStep / 2;
  const impactColor =
    params.sentiment === 'bullish'
      ? UP_COLOR
      : params.sentiment === 'bearish'
        ? DOWN_COLOR
        : '#94a3b8';
  ctx.strokeStyle = impactColor;
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(impactX, PAD.top);
  ctx.lineTo(impactX, HEIGHT - PAD.bottom);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrow
  const arrowStartY = yAt(params.priceBefore);
  const arrowEndY = yAt(params.priceAfter);
  ctx.strokeStyle = impactColor;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(impactX, arrowStartY);
  ctx.lineTo(impactX, arrowEndY);
  ctx.stroke();

  // Arrowhead
  const arrowDir = arrowEndY < arrowStartY ? -1 : 1;
  ctx.fillStyle = impactColor;
  ctx.beginPath();
  ctx.moveTo(impactX, arrowEndY);
  ctx.lineTo(impactX - 5, arrowEndY + arrowDir * 8);
  ctx.lineTo(impactX + 5, arrowEndY + arrowDir * 8);
  ctx.closePath();
  ctx.fill();

  // Price labels
  ctx.font = `700 12px ${FONT}`;
  ctx.textBaseline = 'middle';

  // Before price (left)
  ctx.fillStyle = 'rgba(226,232,240,0.8)';
  ctx.textAlign = 'right';
  ctx.fillText(`${params.priceBefore.toLocaleString()}P`, PAD.left - 10, yAt(params.priceBefore));

  // After price (right)
  ctx.fillStyle = impactColor;
  ctx.textAlign = 'left';
  ctx.fillText(`${params.priceAfter.toLocaleString()}P`, WIDTH - PAD.right + 10, yAt(params.priceAfter));

  // Impact label top center
  const delta = params.priceAfter - params.priceBefore;
  const deltaSign = delta >= 0 ? '+' : '';
  const impactPct = ((delta / Math.max(1, params.priceBefore)) * 100).toFixed(2);
  ctx.font = `700 13px ${FONT}`;
  ctx.fillStyle = impactColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`${deltaSign}${delta.toLocaleString()}P (${deltaSign}${impactPct}%)`, WIDTH / 2, 8);

  // Watermark
  ctx.font = `500 10px ${FONT}`;
  ctx.fillStyle = 'rgba(148,163,184,0.15)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('TinklePaw', WIDTH - 8, HEIGHT - 4);

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'news-chart.png' });
}
