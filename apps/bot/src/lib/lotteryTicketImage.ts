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
  title: string;
  subtitle: string;
  mascot: string;
};

const TIER_STYLE: Record<LotteryTier, TierStyle> = {
  jackpot: {
    accent: '#fb923c',
    accentDeep: '#ea580c',
    paperTop: '#fff8df',
    paperBottom: '#ffefbf',
    foilTop: '#fde68a',
    foilBottom: '#facc15',
    title: 'JACKPOT',
    subtitle: '대박 당첨!',
    mascot: '#fff3c2'
  },
  gold: {
    accent: '#f59e0b',
    accentDeep: '#d97706',
    paperTop: '#fff9e8',
    paperBottom: '#ffefc7',
    foilTop: '#fde68a',
    foilBottom: '#fbbf24',
    title: 'GOLD',
    subtitle: '골드 당첨!',
    mascot: '#ffeecf'
  },
  silver: {
    accent: '#60a5fa',
    accentDeep: '#2563eb',
    paperTop: '#eff6ff',
    paperBottom: '#dbeafe',
    foilTop: '#bfdbfe',
    foilBottom: '#60a5fa',
    title: 'SILVER',
    subtitle: '실버 당첨!',
    mascot: '#e3f0ff'
  },
  bronze: {
    accent: '#f472b6',
    accentDeep: '#db2777',
    paperTop: '#fff1f8',
    paperBottom: '#ffe4f0',
    foilTop: '#f9a8d4',
    foilBottom: '#f472b6',
    title: 'BRONZE',
    subtitle: '브론즈 당첨!',
    mascot: '#ffe4ef'
  },
  miss: {
    accent: '#94a3b8',
    accentDeep: '#64748b',
    paperTop: '#f8fafc',
    paperBottom: '#e2e8f0',
    foilTop: '#cbd5e1',
    foilBottom: '#94a3b8',
    title: 'MISS',
    subtitle: '다음엔 당첨!',
    mascot: '#edf2f7'
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
  const notches = [0.34, 0.66].map((ratio) => y + height * ratio);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  for (const notchY of notches) {
    ctx.arc(x, notchY, radius, 0, Math.PI * 2);
    ctx.arc(x + width, notchY, radius, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
};

const deterministic = (seed: number, index: number) => {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453123;
  return value - Math.floor(value);
};

const drawSparkle = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.22);
  ctx.beginPath();
  ctx.moveTo(x - size, y);
  ctx.lineTo(x + size, y);
  ctx.moveTo(x, y - size);
  ctx.lineTo(x, y + size);
  ctx.stroke();
};

const drawMascot = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  bodyColor: string,
  faceColor: string,
  mood: 'smile' | 'wow' | 'cat'
) => {
  const w = 58 * scale;
  const h = 54 * scale;

  ctx.fillStyle = bodyColor;
  drawRoundedRect(ctx, x, y, w, h, 24 * scale);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,41,59,0.25)';
  ctx.lineWidth = 1.8;
  drawRoundedRect(ctx, x, y, w, h, 24 * scale);
  ctx.stroke();

  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(x + 11 * scale, y + 3 * scale);
  ctx.lineTo(x + 20 * scale, y - 10 * scale);
  ctx.lineTo(x + 27 * scale, y + 7 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + w - 11 * scale, y + 3 * scale);
  ctx.lineTo(x + w - 20 * scale, y - 10 * scale);
  ctx.lineTo(x + w - 27 * scale, y + 7 * scale);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = faceColor;
  ctx.beginPath();
  ctx.arc(x + 21 * scale, y + 24 * scale, 3.2 * scale, 0, Math.PI * 2);
  ctx.arc(x + 37 * scale, y + 24 * scale, 3.2 * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = faceColor;
  ctx.lineWidth = 2;
  if (mood === 'smile') {
    ctx.beginPath();
    ctx.arc(x + 29 * scale, y + 34 * scale, 7 * scale, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else if (mood === 'wow') {
    ctx.beginPath();
    ctx.arc(x + 29 * scale, y + 34 * scale, 3.8 * scale, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x + 24 * scale, y + 33 * scale);
    ctx.lineTo(x + 29 * scale, y + 37 * scale);
    ctx.lineTo(x + 34 * scale, y + 33 * scale);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(251,113,133,0.45)';
  ctx.beginPath();
  ctx.arc(x + 14 * scale, y + 31 * scale, 4 * scale, 0, Math.PI * 2);
  ctx.arc(x + 44 * scale, y + 31 * scale, 4 * scale, 0, Math.PI * 2);
  ctx.fill();
};

const drawInfoCard = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  valueColor: string
) => {
  const h = 66;
  const gradient = ctx.createLinearGradient(x, y, x + width, y + h);
  gradient.addColorStop(0, 'rgba(255,255,255,0.62)');
  gradient.addColorStop(1, 'rgba(255,255,255,0.22)');
  ctx.fillStyle = gradient;
  drawRoundedRect(ctx, x, y, width, h, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,23,42,0.14)';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, x, y, width, h, 14);
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.font = '700 13px Pretendard, sans-serif';
  ctx.fillText(label, x + 12, y + 20);

  ctx.fillStyle = valueColor;
  ctx.font = '800 28px Pretendard, sans-serif';
  ctx.fillText(value, x + 12, y + 50);
};

const drawBarcode = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, seed: number) => {
  let cursor = x;
  let i = 0;
  while (cursor < x + width - 2) {
    const rand = deterministic(seed, i);
    const bar = 1 + Math.floor(rand * 3);
    const gap = 1 + Math.floor(deterministic(seed + 37, i) * 2);
    ctx.fillStyle = rand > 0.2 ? '#0f172a' : '#475569';
    ctx.fillRect(cursor, y, bar, height);
    cursor += bar + gap;
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

  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, '#fde7f3');
  bg.addColorStop(0.45, '#e0f2fe');
  bg.addColorStop(1, '#fef3c7');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (let i = 0; i < 140; i += 1) {
    const x = deterministic(params.ticketNumber, i) * WIDTH;
    const y = deterministic(params.ticketNumber + 88, i * 2) * HEIGHT;
    const r = 1.1 + deterministic(params.ticketNumber + 14, i * 4) * 2;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.32)' : 'rgba(255,182,193,0.18)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const ticketX = 28;
  const ticketY = 28;
  const ticketW = WIDTH - 56;
  const ticketH = HEIGHT - 56;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 10;
  drawRoundedRect(ctx, ticketX, ticketY, ticketW, ticketH, 28);
  ctx.fillStyle = 'rgba(15,23,42,0.12)';
  ctx.fill();
  ctx.restore();

  const paper = ctx.createLinearGradient(ticketX, ticketY, ticketX + ticketW, ticketY + ticketH);
  paper.addColorStop(0, style.paperTop);
  paper.addColorStop(1, style.paperBottom);
  ctx.fillStyle = paper;
  drawRoundedRect(ctx, ticketX, ticketY, ticketW, ticketH, 28);
  ctx.fill();
  punchTicketNotches(ctx, ticketX, ticketY, ticketW, ticketH, 14);

  ctx.strokeStyle = 'rgba(30,41,59,0.35)';
  ctx.lineWidth = 2.2;
  drawRoundedRect(ctx, ticketX, ticketY, ticketW, ticketH, 28);
  ctx.stroke();

  const headerH = 84;
  const header = ctx.createLinearGradient(ticketX, ticketY, ticketX + ticketW, ticketY + headerH);
  header.addColorStop(0, style.accent);
  header.addColorStop(1, style.accentDeep);
  ctx.fillStyle = header;
  drawRoundedRect(ctx, ticketX + 2, ticketY + 2, ticketW - 4, headerH, 24);
  ctx.fill();

  for (let i = 0; i < 24; i += 1) {
    const sx = ticketX + 8 + i * ((ticketW - 16) / 24);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(sx, ticketY + 6, 9, headerH - 6);
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 16px JetBrains Mono, monospace';
  ctx.fillText('NYARU CUTE LOTTERY', ticketX + 22, ticketY + 30);
  ctx.font = '800 34px Pretendard, sans-serif';
  ctx.fillText('HAPPY SCRATCH TICKET', ticketX + 22, ticketY + 66);
  ctx.textAlign = 'right';
  ctx.font = '700 15px JetBrains Mono, monospace';
  ctx.fillText(`#${ticketNumber}`, ticketX + ticketW - 24, ticketY + 34);
  ctx.textAlign = 'left';

  const splitX = ticketX + Math.floor(ticketW * 0.58);
  ctx.strokeStyle = 'rgba(15,23,42,0.28)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(splitX, ticketY + 92);
  ctx.lineTo(splitX, ticketY + ticketH - 18);
  ctx.stroke();
  ctx.setLineDash([]);

  const scratchX = ticketX + 24;
  const scratchY = ticketY + 104;
  const scratchW = splitX - scratchX - 20;
  const scratchH = 144;
  const foil = ctx.createLinearGradient(scratchX, scratchY, scratchX + scratchW, scratchY + scratchH);
  foil.addColorStop(0, style.foilTop);
  foil.addColorStop(1, style.foilBottom);
  ctx.fillStyle = foil;
  drawRoundedRect(ctx, scratchX, scratchY, scratchW, scratchH, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,23,42,0.2)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, scratchX, scratchY, scratchW, scratchH, 16);
  ctx.stroke();

  for (let i = 0; i < 26; i += 1) {
    const x = scratchX + 10 + deterministic(params.ticketNumber, i) * (scratchW - 20);
    const y = scratchY + 8 + deterministic(params.ticketNumber + 99, i * 3) * (scratchH - 16);
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.15)';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 15, y + 7);
    ctx.stroke();
  }

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 13px Pretendard, sans-serif';
  ctx.fillText('SCRATCH AREA', scratchX + 12, scratchY + 22);
  ctx.font = '800 40px Pretendard, sans-serif';
  ctx.fillText(style.title, scratchX + 12, scratchY + 78);
  ctx.font = '700 24px Pretendard, sans-serif';
  ctx.fillText(style.subtitle, scratchX + 12, scratchY + 112);

  drawSparkle(ctx, scratchX + scratchW - 26, scratchY + 26, 8, 'rgba(255,255,255,0.85)');
  drawSparkle(ctx, scratchX + scratchW - 46, scratchY + 44, 5, 'rgba(255,255,255,0.75)');

  drawMascot(ctx, scratchX + 14, scratchY + scratchH + 18, 1.0, style.mascot, '#1e293b', 'smile');
  drawMascot(ctx, scratchX + 74, scratchY + scratchH + 26, 0.86, '#ffffff', '#1e293b', 'wow');
  drawMascot(ctx, scratchX + 124, scratchY + scratchH + 20, 0.92, '#ffe4f1', '#1e293b', 'cat');

  const rightX = splitX + 20;
  const rightW = ticketX + ticketW - rightX - 18;
  drawInfoCard(ctx, rightX, ticketY + 108, rightW, '복권 가격', `-${params.ticketPrice.toLocaleString('ko-KR')}p`, '#0f172a');
  drawInfoCard(
    ctx,
    rightX,
    ticketY + 182,
    rightW,
    '당첨금',
    `+${params.payout.toLocaleString('ko-KR')}p`,
    params.payout > 0 ? '#166534' : '#64748b'
  );
  drawInfoCard(ctx, rightX, ticketY + 256, rightW, '순손익', formatP(params.netChange), params.netChange >= 0 ? '#166534' : '#b91c1c');

  const stampX = ticketX + ticketW - 88;
  const stampY = ticketY + 58;
  ctx.save();
  ctx.translate(stampX, stampY);
  ctx.rotate(-0.16);
  ctx.strokeStyle = style.accentDeep;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = style.accentDeep;
  ctx.font = '800 13px Pretendard, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(params.tier === 'miss' ? 'MISS' : 'LUCKY', 0, 4);
  ctx.restore();
  ctx.textAlign = 'left';

  if (params.tier !== 'miss') {
    for (let i = 0; i < 28; i += 1) {
      const x = ticketX + 16 + deterministic(params.ticketNumber + 401, i) * (ticketW - 32);
      const y = ticketY + 94 + deterministic(params.ticketNumber + 129, i * 4) * (ticketH - 106);
      ctx.fillStyle = i % 2 === 0 ? `${style.accent}88` : 'rgba(255,255,255,0.72)';
      ctx.fillRect(x, y, 4 + Math.floor(deterministic(params.ticketNumber + 44, i * 9) * 4), 2 + Math.floor(deterministic(params.ticketNumber + 51, i * 5) * 3));
    }
  }

  const serialY = ticketY + ticketH - 44;
  const serialGradient = ctx.createLinearGradient(ticketX + 14, serialY, ticketX + ticketW - 14, serialY + 28);
  serialGradient.addColorStop(0, 'rgba(15,23,42,0.88)');
  serialGradient.addColorStop(1, 'rgba(15,23,42,0.7)');
  ctx.fillStyle = serialGradient;
  drawRoundedRect(ctx, ticketX + 14, serialY, ticketW - 28, 28, 8);
  ctx.fill();

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 12px JetBrains Mono, monospace';
  ctx.fillText(`SERIAL ${ticketNumber}`, ticketX + 22, serialY + 19);
  drawBarcode(ctx, ticketX + ticketW - 216, serialY + 6, 180, 16, params.ticketNumber);

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'lottery-result.png' });
};
