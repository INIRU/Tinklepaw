import { AttachmentBuilder } from 'discord.js';
import { registerFont } from 'canvas';
import type { ChartConfiguration } from 'chart.js';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import 'chart.js/auto';
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
  c: number;
};

const chartCanvas = new ChartJSNodeCanvas({
  width: 1100,
  height: 620,
  backgroundColour: '#0b1220',
});

function formatLabel(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function movingAverage(values: number[], windowSize: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const start = Math.max(0, i - windowSize + 1);
    const slice = values.slice(start, i + 1);
    const avg = slice.reduce((acc, cur) => acc + cur, 0) / slice.length;
    result.push(Math.round(avg));
  }
  return result;
}

export async function generateStockChartImage(params: {
  title: string;
  symbol: string;
  currentPrice: number;
  changePct: number;
  candles: StockCandle[];
}) {
  const candles = params.candles.length > 0
    ? params.candles
    : Array.from({ length: 24 }).map((_, idx) => ({
        t: new Date(Date.now() - (23 - idx) * 5 * 60 * 1000).toISOString(),
        c: params.currentPrice,
      }));

  const labels = candles.map((c) => formatLabel(c.t));
  const closePrices = candles.map((c) => c.c);
  const avgPrices = movingAverage(closePrices, 6);

  const trendUp = params.changePct >= 0;
  const lineColor = trendUp ? '#60A5FA' : '#F87171';
  const fillColor = trendUp ? 'rgba(96,165,250,0.18)' : 'rgba(248,113,113,0.18)';

  const chartConfig: ChartConfiguration<'line', number[], string> = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '종가',
          data: closePrices,
          borderColor: lineColor,
          backgroundColor: fillColor,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 3,
        },
        {
          label: '이동 평균(6)',
          data: avgPrices,
          borderColor: 'rgba(244,244,245,0.56)',
          borderDash: [7, 7],
          pointRadius: 0,
          borderWidth: 2,
          fill: false,
          tension: 0.28,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 20,
          right: 24,
          bottom: 16,
          left: 16,
        },
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#E5E7EB',
            boxWidth: 18,
            boxHeight: 2,
            font: {
              family: 'Noto Sans KR, sans-serif',
              size: 12,
              weight: 600,
            },
          },
        },
        title: {
          display: true,
          text: `${params.title} (${params.symbol})`,
          color: '#F8FAFC',
          font: {
            family: 'Noto Sans KR, sans-serif',
            size: 24,
            weight: 700,
          },
          padding: {
            bottom: 4,
          },
        },
        subtitle: {
          display: true,
          text: `현재가 ${params.currentPrice.toLocaleString()}P  ·  변동 ${params.changePct >= 0 ? '+' : ''}${params.changePct.toFixed(2)}%`,
          color: trendUp ? '#93C5FD' : '#FCA5A5',
          font: {
            family: 'Noto Sans KR, sans-serif',
            size: 14,
            weight: 600,
          },
          padding: {
            bottom: 18,
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(148,163,184,0.12)',
          },
          ticks: {
            color: 'rgba(226,232,240,0.8)',
            maxTicksLimit: 10,
            font: {
              family: 'Noto Sans KR, sans-serif',
              size: 11,
            },
          },
        },
        y: {
          grid: {
            color: 'rgba(148,163,184,0.16)',
          },
          ticks: {
            color: 'rgba(226,232,240,0.86)',
            callback: (value) => `${Number(value).toLocaleString()}P`,
            font: {
              family: 'Noto Sans KR, sans-serif',
              size: 12,
            },
          },
        },
      },
    },
  };

  const buffer = await chartCanvas.renderToBuffer(chartConfig, 'image/png');
  return new AttachmentBuilder(buffer, { name: 'stock-chart.png' });
}
