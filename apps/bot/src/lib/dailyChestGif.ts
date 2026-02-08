import { createCanvas } from 'canvas';
import type { CanvasRenderingContext2D } from 'canvas';
import { AttachmentBuilder } from 'discord.js';
import gifenc from 'gifenc';

const { GIFEncoder, applyPalette, quantize } = gifenc;

type DailyChestGifParams = {
  tier: 'common' | 'rare' | 'epic' | 'legendary';
  points: number;
  itemName?: string | null;
};

const WIDTH = 560;
const HEIGHT = 320;
const FRAME_COUNT = 20;
const FRAME_DELAY_MS = 70;

const TIER_COLORS: Record<DailyChestGifParams['tier'], { glow: string; text: string }> = {
  common: { glow: '#9ca3af', text: '#e5e7eb' },
  rare: { glow: '#38bdf8', text: '#bae6fd' },
  epic: { glow: '#f97316', text: '#fed7aa' },
  legendary: { glow: '#facc15', text: '#fef08a' }
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

const drawScene = (ctx: CanvasRenderingContext2D, frameIndex: number, params: DailyChestGifParams) => {
  const progress = frameIndex / (FRAME_COUNT - 1);
  const openProgress = clamp((progress - 0.2) / 0.8, 0, 1);
  const revealProgress = clamp((progress - 0.45) / 0.55, 0, 1);
  const pulse = 0.7 + Math.sin(progress * Math.PI * 8) * 0.3;

  const tierColor = TIER_COLORS[params.tier];
  const centerX = WIDTH / 2;
  const chestY = 176;
  const chestWidth = 220;
  const chestHeight = 104;
  const lidHeight = 52;

  const bgGradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bgGradient.addColorStop(0, '#0f172a');
  bgGradient.addColorStop(1, '#111827');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const ambient = ctx.createRadialGradient(centerX, 86, 10, centerX, 86, 210);
  ambient.addColorStop(0, `${tierColor.glow}AA`);
  ambient.addColorStop(1, '#00000000');
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (let i = 0; i < 20; i += 1) {
    const offset = i * 0.4;
    const x = 28 + ((i * 31 + frameIndex * 9) % (WIDTH - 56));
    const y = 24 + ((Math.sin(frameIndex * 0.35 + offset) + 1) * 0.5) * 120;
    const size = 1 + ((i + frameIndex) % 3);
    ctx.fillStyle = `rgba(255,255,255,${0.12 + 0.1 * pulse})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(centerX, chestY + chestHeight + 18, 138, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  if (revealProgress > 0) {
    const beam = ctx.createLinearGradient(0, chestY - 130, 0, chestY + 18);
    beam.addColorStop(0, `${tierColor.glow}00`);
    beam.addColorStop(0.2, `${tierColor.glow}${Math.round(120 * revealProgress)
      .toString(16)
      .padStart(2, '0')}`);
    beam.addColorStop(1, `${tierColor.glow}00`);
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(centerX - 84, chestY + 14);
    ctx.lineTo(centerX + 84, chestY + 14);
    ctx.lineTo(centerX + 154, chestY - 138);
    ctx.lineTo(centerX - 154, chestY - 138);
    ctx.closePath();
    ctx.fill();
  }

  const chestGradient = ctx.createLinearGradient(0, chestY, 0, chestY + chestHeight);
  chestGradient.addColorStop(0, '#fbbf24');
  chestGradient.addColorStop(1, '#b45309');
  ctx.fillStyle = chestGradient;
  drawRoundedRect(ctx, centerX - chestWidth / 2, chestY, chestWidth, chestHeight, 16);
  ctx.fill();

  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 5;
  drawRoundedRect(ctx, centerX - chestWidth / 2, chestY, chestWidth, chestHeight, 16);
  ctx.stroke();

  ctx.fillStyle = '#78350f';
  ctx.fillRect(centerX - chestWidth / 2 + 12, chestY + 40, chestWidth - 24, 16);

  ctx.fillStyle = '#fef3c7';
  drawRoundedRect(ctx, centerX - 18, chestY + 44, 36, 34, 6);
  ctx.fill();
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, centerX - 18, chestY + 44, 36, 34, 6);
  ctx.stroke();

  const hingeY = chestY + 14;
  const lidAngle = -openProgress * Math.PI * 0.78;
  ctx.save();
  ctx.translate(centerX, hingeY);
  ctx.rotate(lidAngle);
  const lidGradient = ctx.createLinearGradient(0, -lidHeight, 0, 8);
  lidGradient.addColorStop(0, '#fcd34d');
  lidGradient.addColorStop(1, '#c2410c');
  ctx.fillStyle = lidGradient;
  drawRoundedRect(ctx, -chestWidth / 2, -lidHeight, chestWidth, lidHeight, 12);
  ctx.fill();
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 5;
  drawRoundedRect(ctx, -chestWidth / 2, -lidHeight, chestWidth, lidHeight, 12);
  ctx.stroke();
  ctx.restore();

  if (revealProgress > 0.05) {
    const alpha = clamp(revealProgress * 1.2, 0, 1);
    ctx.fillStyle = `rgba(255,255,255,${0.35 * alpha})`;
    ctx.font = '700 36px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`+${params.points.toLocaleString('ko-KR')} PT`, centerX, 88);

    ctx.fillStyle = tierColor.text;
    ctx.font = '700 24px Pretendard, sans-serif';
    ctx.fillText(`등급: ${params.tier.toUpperCase()}`, centerX, 122);

    if (params.itemName) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '600 18px Pretendard, sans-serif';
      ctx.fillText(`획득 아이템: ${params.itemName}`, centerX, 152);
    }
  }
};

export const generateDailyChestGif = async (params: DailyChestGifParams): Promise<AttachmentBuilder> => {
  const encoder = GIFEncoder();

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    drawScene(ctx, frame, params);
    const imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT);
    const palette = quantize(imageData.data, 256);
    const index = applyPalette(imageData.data, palette);
    encoder.writeFrame(index, WIDTH, HEIGHT, {
      palette,
      delay: FRAME_DELAY_MS,
      repeat: frame === 0 ? 0 : undefined
    });
  }

  encoder.finish();
  const gifBuffer = Buffer.from(encoder.bytesView());
  return new AttachmentBuilder(gifBuffer, { name: 'treasure-open.gif' });
};
