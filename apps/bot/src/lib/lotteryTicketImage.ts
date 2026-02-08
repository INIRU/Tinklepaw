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

const TIER_STYLE: Record<
  LotteryTier,
  { title: string; accent: string; accentDeep: string; paper: string; stamp: string; message: string }
> = {
  jackpot: {
    title: 'JACKPOT',
    accent: '#f59e0b',
    accentDeep: '#b45309',
    paper: '#fff7df',
    stamp: '#ea580c',
    message: '초대박 당첨!'
  },
  gold: {
    title: 'GOLD',
    accent: '#facc15',
    accentDeep: '#ca8a04',
    paper: '#fffde8',
    stamp: '#d97706',
    message: '골드 당첨!'
  },
  silver: {
    title: 'SILVER',
    accent: '#60a5fa',
    accentDeep: '#2563eb',
    paper: '#eef5ff',
    stamp: '#1d4ed8',
    message: '실버 당첨!'
  },
  bronze: {
    title: 'BRONZE',
    accent: '#fb7185',
    accentDeep: '#be123c',
    paper: '#fff1f4',
    stamp: '#e11d48',
    message: '브론즈 당첨!'
  },
  miss: {
    title: 'MISS',
    accent: '#94a3b8',
    accentDeep: '#475569',
    paper: '#f3f6fb',
    stamp: '#64748b',
    message: '아쉽지만 꽝!'
  }
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

const drawTicketShape = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  notchRadius: number
) => {
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

const drawStar = (ctx: CanvasRenderingContext2D, x: number, y: number, rOuter: number, rInner: number, spikes: number) => {
  const step = Math.PI / spikes;
  let rot = -Math.PI / 2;

  ctx.beginPath();
  ctx.moveTo(x, y - rOuter);
  for (let i = 0; i < spikes; i += 1) {
    ctx.lineTo(x + Math.cos(rot) * rOuter, y + Math.sin(rot) * rOuter);
    rot += step;
    ctx.lineTo(x + Math.cos(rot) * rInner, y + Math.sin(rot) * rInner);
    rot += step;
  }
  ctx.closePath();
};

export const generateLotteryTicketImage = async (
  params: LotteryTicketImageParams
): Promise<AttachmentBuilder> => {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const tier = TIER_STYLE[params.tier];

  const bgGradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bgGradient.addColorStop(0, '#111827');
  bgGradient.addColorStop(0.55, '#0f172a');
  bgGradient.addColorStop(1, '#020617');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const ambient = ctx.createRadialGradient(WIDTH * 0.65, HEIGHT * 0.22, 24, WIDTH * 0.65, HEIGHT * 0.22, 260);
  ambient.addColorStop(0, `${tier.accent}80`);
  ambient.addColorStop(1, '#00000000');
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (let i = 0; i < 70; i += 1) {
    const x = ((i * 41) % WIDTH) + 4;
    const y = 12 + ((i * 29) % (HEIGHT - 24));
    const size = 0.8 + (i % 3) * 0.65;
    ctx.fillStyle = `rgba(255,255,255,${params.tier === 'miss' ? 0.05 : 0.1})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  const cardX = 42;
  const cardY = 34;
  const cardW = WIDTH - 84;
  const cardH = HEIGHT - 68;

  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const ticketX = cardX + 20;
  const ticketY = cardY + 20;
  const ticketW = cardW - 40;
  const ticketH = cardH - 40;

  const ticketPaper = ctx.createLinearGradient(ticketX, ticketY, ticketX + ticketW, ticketY + ticketH);
  ticketPaper.addColorStop(0, tier.paper);
  ticketPaper.addColorStop(1, '#f8fafc');
  ctx.fillStyle = ticketPaper;
  drawTicketShape(ctx, ticketX, ticketY, ticketW, ticketH, 18);
  ctx.fill();

  for (let i = 0; i < 26; i += 1) {
    const y = ticketY + 20 + i * ((ticketH - 40) / 25);
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(15,23,42,0.03)' : 'rgba(15,23,42,0.015)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ticketX + 14, y);
    ctx.lineTo(ticketX + ticketW - 14, y);
    ctx.stroke();
  }

  const bannerH = 72;
  const banner = ctx.createLinearGradient(ticketX, ticketY, ticketX + ticketW, ticketY + bannerH);
  banner.addColorStop(0, tier.accent);
  banner.addColorStop(1, tier.accentDeep);
  ctx.fillStyle = banner;
  drawRoundedRect(ctx, ticketX + 2, ticketY + 2, ticketW - 4, bannerH, 20);
  ctx.fill();

  for (let i = 0; i < 22; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(ticketX + 6 + i * ((ticketW - 12) / 22), ticketY + 5, 8, bannerH - 6);
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 16px JetBrains Mono, monospace';
  ctx.fillText('NYARU OFFICIAL', ticketX + 24, ticketY + 28);
  ctx.font = '800 34px Pretendard, sans-serif';
  ctx.fillText('INSTANT LOTTERY', ticketX + 24, ticketY + 63);

  const splitX = ticketX + ticketW * 0.63;

  ctx.strokeStyle = 'rgba(15,23,42,0.24)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.moveTo(splitX, ticketY + 86);
  ctx.lineTo(splitX, ticketY + ticketH - 24);
  ctx.stroke();
  ctx.setLineDash([]);

  const ticketNumber = params.ticketNumber.toString().padStart(6, '0');

  const scratchX = ticketX + 24;
  const scratchY = ticketY + 100;
  const scratchW = splitX - scratchX - 22;
  const scratchH = 132;
  const scratchGradient = ctx.createLinearGradient(scratchX, scratchY, scratchX + scratchW, scratchY + scratchH);
  scratchGradient.addColorStop(0, '#cbd5e1');
  scratchGradient.addColorStop(1, '#94a3b8');
  ctx.fillStyle = scratchGradient;
  drawRoundedRect(ctx, scratchX, scratchY, scratchW, scratchH, 16);
  ctx.fill();

  for (let i = 0; i < 18; i += 1) {
    const x = scratchX + 10 + (i * 29) % (scratchW - 20);
    const y = scratchY + 8 + ((i * 17) % (scratchH - 16));
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.24)' : 'rgba(15,23,42,0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 16, y + 9);
    ctx.stroke();
  }

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 13px Pretendard, sans-serif';
  ctx.fillText('스크래치 결과', scratchX + 14, scratchY + 24);

  ctx.fillStyle = params.tier === 'miss' ? '#334155' : tier.accentDeep;
  ctx.font = '800 36px Pretendard, sans-serif';
  ctx.fillText(tier.title, scratchX + 14, scratchY + 77);

  ctx.fillStyle = params.tier === 'miss' ? '#475569' : '#111827';
  ctx.font = '700 24px Pretendard, sans-serif';
  ctx.fillText(tier.message, scratchX + 14, scratchY + 112);

  ctx.fillStyle = '#334155';
  ctx.font = '600 14px Pretendard, sans-serif';
  ctx.fillText(`#${ticketNumber}`, scratchX + 14, scratchY + 130);

  ctx.fillStyle = '#334155';
  ctx.font = '700 13px Pretendard, sans-serif';
  ctx.fillText('TICKET NO.', ticketX + 24, ticketY + ticketH - 72);
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 44px JetBrains Mono, monospace';
  ctx.fillText(ticketNumber, ticketX + 24, ticketY + ticketH - 24);

  const rightX = splitX + 22;
  const infoY = ticketY + 112;
  const infoGap = 56;

  ctx.fillStyle = '#334155';
  ctx.font = '700 15px Pretendard, sans-serif';
  ctx.fillText('복권 가격', rightX, infoY);
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 28px Pretendard, sans-serif';
  ctx.fillText(`-${params.ticketPrice.toLocaleString('ko-KR')}p`, rightX, infoY + 30);

  ctx.fillStyle = '#334155';
  ctx.font = '700 15px Pretendard, sans-serif';
  ctx.fillText('당첨금', rightX, infoY + infoGap);
  ctx.fillStyle = params.payout > 0 ? '#166534' : '#64748b';
  ctx.font = '800 28px Pretendard, sans-serif';
  ctx.fillText(`+${params.payout.toLocaleString('ko-KR')}p`, rightX, infoY + infoGap + 30);

  ctx.fillStyle = '#334155';
  ctx.font = '700 15px Pretendard, sans-serif';
  ctx.fillText('순손익', rightX, infoY + infoGap * 2);
  ctx.fillStyle = params.netChange >= 0 ? '#166534' : '#b91c1c';
  ctx.font = '800 28px Pretendard, sans-serif';
  ctx.fillText(formatP(params.netChange), rightX, infoY + infoGap * 2 + 30);

  ctx.fillStyle = '#334155';
  ctx.font = '700 15px Pretendard, sans-serif';
  ctx.fillText('현재 잔액', rightX, infoY + infoGap * 3);
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 24px Pretendard, sans-serif';
  ctx.fillText(`${params.newBalance.toLocaleString('ko-KR')}p`, rightX, infoY + infoGap * 3 + 28);

  const stampX = ticketX + ticketW - 98;
  const stampY = ticketY + 58;

  ctx.save();
  ctx.translate(stampX, stampY);
  ctx.rotate(-0.14);
  ctx.strokeStyle = tier.stamp;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, 47, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 36, 0, Math.PI * 2);
  ctx.stroke();
  drawStar(ctx, 0, 0, 30, 14, 12);
  ctx.fillStyle = `${tier.stamp}22`;
  ctx.fill();
  ctx.fillStyle = tier.stamp;
  ctx.font = '800 14px Pretendard, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(params.tier === 'miss' ? 'MISS' : 'WIN', 0, 4);
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 3;
  drawTicketShape(ctx, ticketX, ticketY, ticketW, ticketH, 18);
  ctx.stroke();

  if (params.tier !== 'miss') {
    for (let i = 0; i < 22; i += 1) {
      const x = ticketX + 12 + ((i * 31) % (ticketW - 24));
      const y = ticketY + 84 + ((i * 21) % (ticketH - 94));
      ctx.fillStyle = i % 2 === 0 ? `${tier.accent}99` : '#ffffff99';
      ctx.fillRect(x, y, 5, 2);
    }
  }

  ctx.fillStyle = 'rgba(2,6,23,0.32)';
  drawRoundedRect(ctx, ticketX + 1, ticketY + ticketH - 16, ticketW - 2, 12, 6);
  ctx.fill();

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 12px JetBrains Mono, monospace';
  ctx.fillText('VALID ONLY FOR NYARU DISCORD LOTTERY · NO CASH VALUE', ticketX + 14, ticketY + ticketH - 7);

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'lottery-result.png' });
};
