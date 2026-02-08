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

const TIER_COLORS: Record<DailyChestGifParams['tier'], { glow: string; text: string; accent: string }> = {
  common: { glow: '#94a3b8', text: '#e2e8f0', accent: '#cbd5e1' },
  rare: { glow: '#38bdf8', text: '#bae6fd', accent: '#7dd3fc' },
  epic: { glow: '#fb923c', text: '#ffedd5', accent: '#fdba74' },
  legendary: { glow: '#facc15', text: '#fef08a', accent: '#fde68a' }
};

const TIER_LABELS: Record<DailyChestGifParams['tier'], string> = {
  common: '커먼',
  rare: '레어',
  epic: '에픽',
  legendary: '레전더리'
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const easeOutBack = (value: number, overshoot = 1.2) => {
  const t = value - 1;
  return 1 + (overshoot + 1) * t * t * t + overshoot * t * t;
};
const truncateText = (value: string, maxLength: number) => (value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`);

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return `rgba(255,255,255,${clamp(alpha, 0, 1)})`;
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
};

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

const drawSparkle = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  alpha: number,
  angle = 0
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.lineWidth = Math.max(1, size * 0.25);
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.lineTo(size, 0);
  ctx.moveTo(0, -size);
  ctx.lineTo(0, size);
  ctx.stroke();
  ctx.globalAlpha = clamp(alpha * 0.6, 0, 1);
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
};

const drawScene = (ctx: CanvasRenderingContext2D, frameIndex: number, params: DailyChestGifParams) => {
  const progress = frameIndex / (FRAME_COUNT - 1);
  const openProgress = clamp(easeOutBack(clamp((progress - 0.16) / 0.74, 0, 1), 1.12), 0, 1.08);
  const revealProgress = clamp((progress - 0.44) / 0.56, 0, 1);
  const pulse = 0.55 + Math.sin(progress * Math.PI * 10) * 0.45;
  const preShakeStrength = progress < 0.22 ? 1 - progress / 0.22 : 0;
  const shakeX = Math.sin(progress * 140) * preShakeStrength * 3.2;
  const floatY = Math.sin(progress * Math.PI * 2.4) * 1.8;

  const tierColor = TIER_COLORS[params.tier];
  const centerX = WIDTH / 2;
  const chestY = 172 + floatY;
  const chestWidth = 236;
  const chestHeight = 110;
  const lidHeight = 58;
  const chestX = centerX - chestWidth / 2 + shakeX;

  const bgGradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bgGradient.addColorStop(0, '#070d1f');
  bgGradient.addColorStop(0.55, '#0f172a');
  bgGradient.addColorStop(1, '#111827');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const ambient = ctx.createRadialGradient(centerX, 104, 10, centerX, 104, 250);
  ambient.addColorStop(0, hexToRgba(tierColor.glow, 0.5 + revealProgress * 0.18));
  ambient.addColorStop(0.45, hexToRgba(tierColor.glow, 0.12 + revealProgress * 0.1));
  ambient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.translate(centerX, chestY - 18);
  ctx.rotate(progress * 0.9);
  for (let i = 0; i < 14; i += 1) {
    ctx.rotate((Math.PI * 2) / 14);
    ctx.fillStyle = `rgba(255,255,255,${0.02 + revealProgress * 0.05 + pulse * 0.015})`;
    ctx.beginPath();
    ctx.moveTo(-8, -14);
    ctx.lineTo(8, -14);
    ctx.lineTo(2.5, -150);
    ctx.lineTo(-2.5, -150);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  for (let i = 0; i < 24; i += 1) {
    const offset = i * 0.44;
    const x = 22 + ((i * 27 + frameIndex * 8) % (WIDTH - 44));
    const y = 20 + ((Math.sin(frameIndex * 0.32 + offset) + 1) * 0.5) * 126;
    const size = 0.8 + ((i + frameIndex) % 3) * 0.7;
    ctx.fillStyle = `rgba(255,255,255,${0.06 + 0.07 * pulse})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  const vignette = ctx.createRadialGradient(centerX, HEIGHT * 0.45, 52, centerX, HEIGHT * 0.45, 380);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const floor = ctx.createLinearGradient(0, chestY + chestHeight - 8, 0, HEIGHT);
  floor.addColorStop(0, 'rgba(255,255,255,0.05)');
  floor.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, chestY + chestHeight - 8, WIDTH, HEIGHT - (chestY + chestHeight - 8));

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(centerX + shakeX * 0.35, chestY + chestHeight + 18, 152, 26, 0, 0, Math.PI * 2);
  ctx.fill();

  if (revealProgress > 0) {
    const innerGlow = ctx.createRadialGradient(centerX + shakeX, chestY + 28, 12, centerX + shakeX, chestY + 28, 90);
    innerGlow.addColorStop(0, hexToRgba(tierColor.accent, 0.72 * revealProgress));
    innerGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = innerGlow;
    ctx.beginPath();
    ctx.ellipse(centerX + shakeX, chestY + 34, chestWidth * 0.36, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    const beam = ctx.createLinearGradient(0, chestY - 152, 0, chestY + 24);
    beam.addColorStop(0, 'rgba(0,0,0,0)');
    beam.addColorStop(0.22, hexToRgba(tierColor.glow, 0.48 * revealProgress));
    beam.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(centerX + shakeX - 92, chestY + 18);
    ctx.lineTo(centerX + shakeX + 92, chestY + 18);
    ctx.lineTo(centerX + shakeX + 160, chestY - 148);
    ctx.lineTo(centerX + shakeX - 160, chestY - 148);
    ctx.closePath();
    ctx.fill();

    for (let i = 0; i < 26; i += 1) {
      const orbit = 42 + revealProgress * 162 + ((i % 3) - 1) * 11;
      const angle = i * 0.82 + progress * 6.2;
      const x = centerX + shakeX + Math.cos(angle) * orbit;
      const y = chestY + 30 - Math.sin(angle) * (46 + revealProgress * 88) - revealProgress * 22;
      const alpha = (0.12 + 0.3 * revealProgress) * (0.65 + 0.35 * Math.sin(frameIndex * 0.65 + i));
      const size = 1.2 + ((i + frameIndex) % 3) * 0.9;
      if (i % 4 === 0) {
        drawSparkle(ctx, x, y, 2.3 + size, tierColor.accent, alpha, angle * 0.6);
      } else {
        ctx.fillStyle = hexToRgba(tierColor.accent, alpha);
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const chestGradient = ctx.createLinearGradient(0, chestY, 0, chestY + chestHeight);
  chestGradient.addColorStop(0, '#b45309');
  chestGradient.addColorStop(0.46, '#92400e');
  chestGradient.addColorStop(1, '#7c2d12');
  ctx.fillStyle = chestGradient;
  drawRoundedRect(ctx, chestX, chestY, chestWidth, chestHeight, 18);
  ctx.fill();

  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 5;
  drawRoundedRect(ctx, chestX, chestY, chestWidth, chestHeight, 18);
  ctx.stroke();

  const strapGradient = ctx.createLinearGradient(0, chestY, 0, chestY + chestHeight);
  strapGradient.addColorStop(0, '#fcd34d');
  strapGradient.addColorStop(1, '#d97706');
  ctx.fillStyle = strapGradient;
  drawRoundedRect(ctx, chestX + 10, chestY + 12, chestWidth - 20, 18, 7);
  ctx.fill();
  drawRoundedRect(ctx, chestX + 10, chestY + 50, chestWidth - 20, 17, 7);
  ctx.fill();

  ctx.strokeStyle = 'rgba(69,26,3,0.8)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, chestX + 10, chestY + 12, chestWidth - 20, 18, 7);
  ctx.stroke();
  drawRoundedRect(ctx, chestX + 10, chestY + 50, chestWidth - 20, 17, 7);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 2;
  for (let i = 1; i <= 4; i += 1) {
    const x = chestX + (chestWidth / 5) * i;
    ctx.beginPath();
    ctx.moveTo(x, chestY + 33);
    ctx.lineTo(x, chestY + chestHeight - 10);
    ctx.stroke();
  }

  for (let i = 0; i < 6; i += 1) {
    const x = chestX + 24 + i * 38;
    const y = chestY + 58;
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  ctx.fillStyle = '#fef3c7';
  drawRoundedRect(ctx, centerX + shakeX - 18, chestY + 42, 36, 38, 7);
  ctx.fill();
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, centerX + shakeX - 18, chestY + 42, 36, 38, 7);
  ctx.stroke();

  ctx.fillStyle = '#78350f';
  ctx.beginPath();
  ctx.moveTo(centerX + shakeX, chestY + 51);
  ctx.lineTo(centerX + shakeX - 4, chestY + 58);
  ctx.lineTo(centerX + shakeX + 4, chestY + 58);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(centerX + shakeX, chestY + 65, 3.5, 0, Math.PI * 2);
  ctx.fill();

  const hingeY = chestY + 12;
  const lidAngle = -openProgress * Math.PI * 0.72;
  ctx.save();
  ctx.translate(centerX + shakeX, hingeY);
  ctx.rotate(lidAngle);

  if (openProgress > 0.02) {
    ctx.fillStyle = 'rgba(24,18,14,0.9)';
    drawRoundedRect(ctx, -chestWidth / 2 + 5, -lidHeight + 8, chestWidth - 10, lidHeight - 14, 10);
    ctx.fill();
  }

  const lidGradient = ctx.createLinearGradient(0, -lidHeight, 0, 8);
  lidGradient.addColorStop(0, '#c2410c');
  lidGradient.addColorStop(0.45, '#9a3412');
  lidGradient.addColorStop(1, '#7c2d12');
  ctx.fillStyle = lidGradient;
  drawRoundedRect(ctx, -chestWidth / 2, -lidHeight, chestWidth, lidHeight, 12);
  ctx.fill();

  ctx.fillStyle = '#fbbf24';
  drawRoundedRect(ctx, -chestWidth / 2 + 10, -lidHeight + 11, chestWidth - 20, 16, 7);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.11)';
  drawRoundedRect(ctx, -chestWidth / 2 + 10, -lidHeight + 8, chestWidth - 20, 7, 5);
  ctx.fill();

  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 5;
  drawRoundedRect(ctx, -chestWidth / 2, -lidHeight, chestWidth, lidHeight, 12);
  ctx.stroke();
  ctx.restore();

  if (revealProgress > 0.05) {
    const alpha = clamp(revealProgress * 1.2, 0, 1);
    const panelWidth = 452;
    const panelHeight = params.itemName ? 110 : 88;
    const panelX = centerX - panelWidth / 2;
    const panelY = 24;

    ctx.fillStyle = `rgba(4,10,20,${0.48 + alpha * 0.26})`;
    drawRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 18);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(tierColor.glow, 0.28 + alpha * 0.42);
    ctx.lineWidth = 2.2;
    drawRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 18);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 9;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 6;
    ctx.font = '700 38px Pretendard, sans-serif';
    const pointText = `+${params.points.toLocaleString('ko-KR')} p`;
    ctx.strokeText(pointText, centerX, 72);
    ctx.fillText(pointText, centerX, 72);

    ctx.shadowBlur = 0;
    ctx.fillStyle = tierColor.text;
    ctx.font = '700 23px Pretendard, sans-serif';
    ctx.fillText(`등급 ${TIER_LABELS[params.tier]}`, centerX, 104);

    if (params.itemName) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '600 17px Pretendard, sans-serif';
      ctx.fillText(`획득 아이템: ${truncateText(params.itemName, 26)}`, centerX, 134);
    }
  }
};

export const generateDailyChestGif = async (params: DailyChestGifParams): Promise<AttachmentBuilder> => {
  const encoder = GIFEncoder();

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const frames: Uint8ClampedArray[] = [];

  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    drawScene(ctx, frame, params);
    frames.push(new Uint8ClampedArray(ctx.getImageData(0, 0, WIDTH, HEIGHT).data));
  }

  const sampledFrames = frames.filter((_, index) => index % 2 === 0 || index === frames.length - 1);
  const paletteSource = new Uint8Array(sampledFrames.length * WIDTH * HEIGHT * 4);
  let sourceOffset = 0;
  for (const framePixels of sampledFrames) {
    paletteSource.set(framePixels, sourceOffset);
    sourceOffset += framePixels.length;
  }

  const palette = quantize(paletteSource, 256);

  for (let frame = 0; frame < frames.length; frame += 1) {
    const index = applyPalette(frames[frame], palette);
    encoder.writeFrame(index, WIDTH, HEIGHT, {
      palette,
      delay: FRAME_DELAY_MS,
      repeat: frame === 0 ? -1 : undefined
    });
  }

  encoder.finish();
  const gifBuffer = Buffer.from(encoder.bytesView());
  return new AttachmentBuilder(gifBuffer, { name: 'treasure-open.gif' });
};
