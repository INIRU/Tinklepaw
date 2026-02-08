import { createCanvas } from 'canvas';
import type { CanvasRenderingContext2D } from 'canvas';
import { AttachmentBuilder } from 'discord.js';

export type LotteryTier = 'jackpot' | 'gold' | 'silver' | 'bronze' | 'miss';

type LotteryTicketImageParams = {
  tier: LotteryTier;
  ticketNumber: number;
  ticketPrice: number;
  payout: number;
  netChange: number;
  newBalance: number;
};

const WIDTH = 760;
const HEIGHT = 420;

const TIER_STYLE: Record<LotteryTier, { title: string; accent: string; soft: string; stamp: string }> = {
  jackpot: { title: 'JACKPOT', accent: '#f59e0b', soft: '#fef3c7', stamp: '#f97316' },
  gold: { title: 'GOLD WIN', accent: '#fbbf24', soft: '#fef9c3', stamp: '#f59e0b' },
  silver: { title: 'SILVER WIN', accent: '#60a5fa', soft: '#dbeafe', stamp: '#3b82f6' },
  bronze: { title: 'BRONZE WIN', accent: '#fb7185', soft: '#ffe4e6', stamp: '#e11d48' },
  miss: { title: 'TRY AGAIN', accent: '#94a3b8', soft: '#e2e8f0', stamp: '#64748b' }
};

const formatP = (value: number) => `${value >= 0 ? '+' : ''}${value.toLocaleString('ko-KR')}p`;

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
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
};

const drawTicketShape = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
  const notchRadius = 18;
  const centerY = y + height / 2;

  drawRoundedRect(ctx, x, y, width, height, 26);
  ctx.save();
  ctx.clip();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(x, centerY, notchRadius, 0, Math.PI * 2);
  ctx.arc(x + width, centerY, notchRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
};

export const generateLotteryTicketImage = async (
  params: LotteryTicketImageParams
): Promise<AttachmentBuilder> => {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const tier = TIER_STYLE[params.tier];

  const bgGradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bgGradient.addColorStop(0, '#0b1020');
  bgGradient.addColorStop(0.5, '#111827');
  bgGradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const ambient = ctx.createRadialGradient(WIDTH * 0.7, HEIGHT * 0.2, 30, WIDTH * 0.7, HEIGHT * 0.2, 240);
  ambient.addColorStop(0, `${tier.accent}66`);
  ambient.addColorStop(1, '#00000000');
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (let i = 0; i < 40; i += 1) {
    const x = ((i * 53) % WIDTH) + 8;
    const y = 20 + ((i * 37) % (HEIGHT - 40));
    const size = 1 + (i % 3);
    ctx.fillStyle = `rgba(255,255,255,${params.tier === 'miss' ? 0.08 : 0.14})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  const cardX = 56;
  const cardY = 40;
  const cardW = WIDTH - 112;
  const cardH = HEIGHT - 80;

  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const ticketX = cardX + 26;
  const ticketY = cardY + 28;
  const ticketW = cardW - 52;
  const ticketH = cardH - 56;

  const ticketGradient = ctx.createLinearGradient(ticketX, ticketY, ticketX + ticketW, ticketY + ticketH);
  ticketGradient.addColorStop(0, '#111827');
  ticketGradient.addColorStop(1, '#1f2937');
  ctx.fillStyle = ticketGradient;
  drawTicketShape(ctx, ticketX, ticketY, ticketW, ticketH);
  ctx.fill();

  ctx.strokeStyle = `${tier.accent}cc`;
  ctx.lineWidth = 3;
  drawTicketShape(ctx, ticketX, ticketY, ticketW, ticketH);
  ctx.stroke();

  const splitX = ticketX + ticketW * 0.62;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(splitX, ticketY + 20);
  ctx.lineTo(splitX, ticketY + ticketH - 20);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 20px Pretendard, sans-serif';
  ctx.fillText('NYARU LOTTERY', ticketX + 26, ticketY + 42);

  ctx.fillStyle = `${tier.soft}`;
  ctx.font = '700 38px Pretendard, sans-serif';
  ctx.fillText(tier.title, ticketX + 24, ticketY + 94);

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '600 16px Pretendard, sans-serif';
  ctx.fillText('Ticket No.', ticketX + 24, ticketY + 128);

  const ticketNumber = params.ticketNumber.toString().padStart(6, '0');
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 54px JetBrains Mono, monospace';
  ctx.fillText(ticketNumber, ticketX + 24, ticketY + 185);

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '600 15px Pretendard, sans-serif';
  ctx.fillText(`구매비용 ${params.ticketPrice.toLocaleString('ko-KR')}p`, ticketX + 24, ticketY + 220);

  ctx.fillStyle = params.netChange >= 0 ? '#86efac' : '#fca5a5';
  ctx.font = '700 26px Pretendard, sans-serif';
  ctx.fillText(`순손익 ${formatP(params.netChange)}`, ticketX + 24, ticketY + 257);

  const stampX = ticketX + ticketW * 0.8;
  const stampY = ticketY + 92;
  const stampRadius = 58;

  ctx.save();
  ctx.translate(stampX, stampY);
  ctx.rotate(-0.18);
  ctx.strokeStyle = tier.stamp;
  ctx.lineWidth = 6;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.arc(0, 0, stampRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `${tier.stamp}22`;
  ctx.beginPath();
  ctx.arc(0, 0, stampRadius - 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tier.soft;
  ctx.font = '700 18px Pretendard, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(params.tier === 'miss' ? '꽝' : '당첨', 0, -4);
  ctx.font = '700 14px Pretendard, sans-serif';
  ctx.fillText(params.tier.toUpperCase(), 0, 20);
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.74)';
  ctx.font = '600 15px Pretendard, sans-serif';
  ctx.fillText('당첨금', splitX + 28, ticketY + 180);
  ctx.fillStyle = params.payout > 0 ? '#fef08a' : 'rgba(255,255,255,0.6)';
  ctx.font = '700 34px Pretendard, sans-serif';
  ctx.fillText(formatP(params.payout), splitX + 28, ticketY + 220);

  ctx.fillStyle = 'rgba(255,255,255,0.74)';
  ctx.font = '600 15px Pretendard, sans-serif';
  ctx.fillText('현재 잔액', splitX + 28, ticketY + 258);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '700 24px Pretendard, sans-serif';
  ctx.fillText(`${params.newBalance.toLocaleString('ko-KR')}p`, splitX + 28, ticketY + 292);

  if (params.tier !== 'miss') {
    for (let i = 0; i < 18; i += 1) {
      const x = ticketX + 18 + ((i * 41) % (ticketW - 36));
      const y = ticketY + 10 + ((i * 29) % (ticketH - 20));
      ctx.fillStyle = i % 2 === 0 ? `${tier.accent}aa` : '#ffffffaa';
      ctx.fillRect(x, y, 6, 3);
    }
  }

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'lottery-result.png' });
};
