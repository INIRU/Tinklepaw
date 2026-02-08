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

type TierStyle = {
  accent: string;
  accentDeep: string;
  paperTop: string;
  paperBottom: string;
  foilTop: string;
  foilBottom: string;
  stamp: string;
  title: string;
  message: string;
};

const TIER_STYLE: Record<LotteryTier, TierStyle> = {
  jackpot: {
    accent: '#f59e0b',
    accentDeep: '#b45309',
    paperTop: '#fff7d6',
    paperBottom: '#fff3bf',
    foilTop: '#fef08a',
    foilBottom: '#facc15',
    stamp: '#ea580c',
    title: 'JACKPOT',
    message: '초대박 당첨!'
  },
  gold: {
    accent: '#f59e0b',
    accentDeep: '#ca8a04',
    paperTop: '#fffbe6',
    paperBottom: '#fef3c7',
    foilTop: '#fde68a',
    foilBottom: '#fbbf24',
    stamp: '#d97706',
    title: 'GOLD',
    message: '골드 당첨!'
  },
  silver: {
    accent: '#60a5fa',
    accentDeep: '#2563eb',
    paperTop: '#eff6ff',
    paperBottom: '#dbeafe',
    foilTop: '#bfdbfe',
    foilBottom: '#60a5fa',
    stamp: '#1d4ed8',
    title: 'SILVER',
    message: '실버 당첨!'
  },
  bronze: {
    accent: '#fb7185',
    accentDeep: '#be123c',
    paperTop: '#fff1f2',
    paperBottom: '#ffe4e6',
    foilTop: '#fda4af',
    foilBottom: '#fb7185',
    stamp: '#e11d48',
    title: 'BRONZE',
    message: '브론즈 당첨!'
  },
  miss: {
    accent: '#94a3b8',
    accentDeep: '#475569',
    paperTop: '#f8fafc',
    paperBottom: '#e2e8f0',
    foilTop: '#cbd5e1',
    foilBottom: '#94a3b8',
    stamp: '#64748b',
    title: 'MISS',
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

const punchTicketNotches = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const notchY = [0.32, 0.68].map((ratio) => y + height * ratio);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  for (const value of notchY) {
    ctx.arc(x, value, radius, 0, Math.PI * 2);
    ctx.arc(x + width, value, radius, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
};

const drawStar = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  spikes: number,
  outerRadius: number,
  innerRadius: number
) => {
  let rotation = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(x, y - outerRadius);
  for (let i = 0; i < spikes; i += 1) {
    ctx.lineTo(x + Math.cos(rotation) * outerRadius, y + Math.sin(rotation) * outerRadius);
    rotation += step;
    ctx.lineTo(x + Math.cos(rotation) * innerRadius, y + Math.sin(rotation) * innerRadius);
    rotation += step;
  }
  ctx.closePath();
};

const deterministicRandom = (seed: number, index: number) => {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

const drawInfoCard = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
  valueColor: string
) => {
  const panelGradient = ctx.createLinearGradient(x, y, x + width, y + height);
  panelGradient.addColorStop(0, 'rgba(255,255,255,0.5)');
  panelGradient.addColorStop(1, 'rgba(255,255,255,0.18)');
  ctx.fillStyle = panelGradient;
  drawRoundedRect(ctx, x, y, width, height, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,23,42,0.12)';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, x, y, width, height, 12);
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.font = '700 13px Pretendard, sans-serif';
  ctx.fillText(label, x + 12, y + 19);

  ctx.fillStyle = valueColor;
  ctx.font = '800 26px Pretendard, sans-serif';
  ctx.fillText(value, x + 12, y + 50);
};

const drawBarcode = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number
) => {
  let cursor = x;
  let i = 0;
  while (cursor < x + width - 2) {
    const random = deterministicRandom(seed, i);
    const barWidth = 1 + Math.floor(random * 3);
    const gap = 1 + Math.floor(deterministicRandom(seed, i + 41) * 2);
    ctx.fillStyle = random > 0.18 ? '#0f172a' : '#475569';
    ctx.fillRect(cursor, y, barWidth, height);
    cursor += barWidth + gap;
    i += 1;
  }
};

export const generateLotteryTicketImage = async (
  params: LotteryTicketImageParams
): Promise<AttachmentBuilder> => {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const style = TIER_STYLE[params.tier];
  const ticketNumber = params.ticketNumber.toString().padStart(6, '0');

  const bgGradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bgGradient.addColorStop(0, '#0f172a');
  bgGradient.addColorStop(0.58, '#111827');
  bgGradient.addColorStop(1, '#020617');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const ambient = ctx.createRadialGradient(WIDTH * 0.68, HEIGHT * 0.16, 20, WIDTH * 0.68, HEIGHT * 0.16, 250);
  ambient.addColorStop(0, `${style.accent}99`);
  ambient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (let i = 0; i < 90; i += 1) {
    const randomX = deterministicRandom(params.ticketNumber, i);
    const randomY = deterministicRandom(params.ticketNumber + 13, i * 7);
    const randomS = deterministicRandom(params.ticketNumber + 71, i * 11);
    const x = 12 + randomX * (WIDTH - 24);
    const y = 8 + randomY * (HEIGHT - 16);
    const size = 0.5 + randomS * 1.6;
    ctx.fillStyle = `rgba(255,255,255,${params.tier === 'miss' ? 0.05 : 0.11})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  const ticketX = 34;
  const ticketY = 30;
  const ticketW = WIDTH - 68;
  const ticketH = HEIGHT - 60;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 12;
  drawRoundedRect(ctx, ticketX, ticketY, ticketW, ticketH, 24);
  ctx.fillStyle = 'rgba(15,23,42,0.55)';
  ctx.fill();
  ctx.restore();

  const paperGradient = ctx.createLinearGradient(ticketX, ticketY, ticketX + ticketW, ticketY + ticketH);
  paperGradient.addColorStop(0, style.paperTop);
  paperGradient.addColorStop(1, style.paperBottom);
  ctx.fillStyle = paperGradient;
  drawRoundedRect(ctx, ticketX, ticketY, ticketW, ticketH, 24);
  ctx.fill();
  punchTicketNotches(ctx, ticketX, ticketY, ticketW, ticketH, 14);

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2.5;
  drawRoundedRect(ctx, ticketX, ticketY, ticketW, ticketH, 24);
  ctx.stroke();

  for (let i = 0; i < 24; i += 1) {
    const y = ticketY + 88 + i * ((ticketH - 120) / 23);
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(15,23,42,0.035)' : 'rgba(15,23,42,0.018)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ticketX + 16, y);
    ctx.lineTo(ticketX + ticketW - 16, y);
    ctx.stroke();
  }

  const headerHeight = 82;
  const headerGradient = ctx.createLinearGradient(ticketX, ticketY, ticketX + ticketW, ticketY + headerHeight);
  headerGradient.addColorStop(0, style.accent);
  headerGradient.addColorStop(1, style.accentDeep);
  ctx.fillStyle = headerGradient;
  drawRoundedRect(ctx, ticketX + 2, ticketY + 2, ticketW - 4, headerHeight, 20);
  ctx.fill();

  for (let i = 0; i < 26; i += 1) {
    const stripeX = ticketX + 6 + i * ((ticketW - 12) / 26);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(stripeX, ticketY + 6, 8, headerHeight - 7);
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 15px JetBrains Mono, monospace';
  ctx.fillText('NYARU MEGA LOTTERY', ticketX + 22, ticketY + 28);
  ctx.font = '800 34px Pretendard, sans-serif';
  ctx.fillText('INSTANT SCRATCH', ticketX + 22, ticketY + 64);
  ctx.font = '700 16px JetBrains Mono, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`#${ticketNumber}`, ticketX + ticketW - 24, ticketY + 34);
  ctx.textAlign = 'left';

  const splitX = ticketX + Math.floor(ticketW * 0.58);
  ctx.strokeStyle = 'rgba(15,23,42,0.25)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(splitX, ticketY + 92);
  ctx.lineTo(splitX, ticketY + ticketH - 18);
  ctx.stroke();
  ctx.setLineDash([]);

  const scratchX = ticketX + 28;
  const scratchY = ticketY + 104;
  const scratchW = splitX - scratchX - 22;
  const scratchH = 152;
  const foilGradient = ctx.createLinearGradient(scratchX, scratchY, scratchX + scratchW, scratchY + scratchH);
  foilGradient.addColorStop(0, style.foilTop);
  foilGradient.addColorStop(1, style.foilBottom);
  ctx.fillStyle = foilGradient;
  drawRoundedRect(ctx, scratchX, scratchY, scratchW, scratchH, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,23,42,0.2)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, scratchX, scratchY, scratchW, scratchH, 16);
  ctx.stroke();

  for (let i = 0; i < 24; i += 1) {
    const x = scratchX + 8 + deterministicRandom(params.ticketNumber, i) * (scratchW - 20);
    const y = scratchY + 6 + deterministicRandom(params.ticketNumber + 97, i * 3) * (scratchH - 12);
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.32)' : 'rgba(15,23,42,0.16)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 14, y + 7);
    ctx.stroke();
  }

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 13px Pretendard, sans-serif';
  ctx.fillText('SCRATCH RESULT', scratchX + 12, scratchY + 22);
  ctx.font = '800 40px Pretendard, sans-serif';
  ctx.fillText(style.title, scratchX + 12, scratchY + 78);
  ctx.font = '700 24px Pretendard, sans-serif';
  ctx.fillText(style.message, scratchX + 12, scratchY + 114);
  ctx.font = '700 14px JetBrains Mono, monospace';
  ctx.fillText(`NO.${ticketNumber}`, scratchX + 12, scratchY + 136);

  const rightX = splitX + 20;
  const cardW = ticketX + ticketW - rightX - 20;
  const cardH = 58;
  const cardGap = 12;
  drawInfoCard(ctx, rightX, ticketY + 106, cardW, cardH, '복권 가격', `-${params.ticketPrice.toLocaleString('ko-KR')}p`, '#0f172a');
  drawInfoCard(
    ctx,
    rightX,
    ticketY + 106 + (cardH + cardGap),
    cardW,
    cardH,
    '당첨금',
    `+${params.payout.toLocaleString('ko-KR')}p`,
    params.payout > 0 ? '#166534' : '#64748b'
  );
  drawInfoCard(
    ctx,
    rightX,
    ticketY + 106 + (cardH + cardGap) * 2,
    cardW,
    cardH,
    '순손익',
    formatP(params.netChange),
    params.netChange >= 0 ? '#166534' : '#b91c1c'
  );
  drawInfoCard(
    ctx,
    rightX,
    ticketY + 106 + (cardH + cardGap) * 3,
    cardW,
    cardH,
    '현재 잔액',
    `${params.newBalance.toLocaleString('ko-KR')}p`,
    '#0f172a'
  );

  const stampX = ticketX + ticketW - 98;
  const stampY = ticketY + 56;
  ctx.save();
  ctx.translate(stampX, stampY);
  ctx.rotate(-0.18);
  ctx.strokeStyle = style.stamp;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, 45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 33, 0, Math.PI * 2);
  ctx.stroke();
  drawStar(ctx, 0, 0, 10, 27, 12);
  ctx.fillStyle = `${style.stamp}22`;
  ctx.fill();
  ctx.fillStyle = style.stamp;
  ctx.font = '800 13px Pretendard, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(params.tier === 'miss' ? 'MISS' : 'WIN', 0, 4);
  ctx.restore();
  ctx.textAlign = 'left';

  if (params.tier !== 'miss') {
    for (let i = 0; i < 32; i += 1) {
      const randomX = deterministicRandom(params.ticketNumber + 777, i);
      const randomY = deterministicRandom(params.ticketNumber + 91, i * 4);
      const x = ticketX + 12 + randomX * (ticketW - 24);
      const y = ticketY + 90 + randomY * (ticketH - 102);
      const width = 4 + Math.floor(deterministicRandom(params.ticketNumber + 17, i * 9) * 4);
      const height = 2 + Math.floor(deterministicRandom(params.ticketNumber + 31, i * 5) * 3);
      ctx.fillStyle = i % 2 === 0 ? `${style.accent}88` : 'rgba(255,255,255,0.75)';
      ctx.fillRect(x, y, width, height);
    }
  }

  const serialY = ticketY + ticketH - 54;
  const serialH = 34;
  const serialGradient = ctx.createLinearGradient(ticketX + 14, serialY, ticketX + ticketW - 14, serialY + serialH);
  serialGradient.addColorStop(0, 'rgba(15,23,42,0.9)');
  serialGradient.addColorStop(1, 'rgba(15,23,42,0.72)');
  ctx.fillStyle = serialGradient;
  drawRoundedRect(ctx, ticketX + 14, serialY, ticketW - 28, serialH, 8);
  ctx.fill();

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 13px JetBrains Mono, monospace';
  ctx.fillText(`SERIAL ${ticketNumber}`, ticketX + 24, serialY + 22);
  drawBarcode(ctx, ticketX + ticketW - 230, serialY + 7, 190, 20, params.ticketNumber);

  ctx.fillStyle = 'rgba(226,232,240,0.9)';
  ctx.font = '600 11px JetBrains Mono, monospace';
  ctx.fillText('VALID ONLY FOR NYARU DISCORD LOTTERY · NO CASH VALUE', ticketX + 18, ticketY + ticketH - 8);

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'lottery-result.png' });
};
