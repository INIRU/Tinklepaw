import { createCanvas } from 'canvas';
import type { CanvasRenderingContext2D } from 'canvas';
import { AttachmentBuilder } from 'discord.js';

type GuideItem = {
  emoji: string;
  label: string;
};

const GUIDE_ITEMS: GuideItem[] = [
  { emoji: '🔤', label: '이름 변경' },
  { emoji: '1️⃣', label: '1명 제한' },
  { emoji: '2️⃣', label: '2명 제한' },
  { emoji: '🔒', label: '잠금' },
  { emoji: '🔓', label: '잠금해제' },
  { emoji: '🎙️', label: '1인실 생성' },
  { emoji: '🎧', label: '2인실 생성' },
  { emoji: '🗣️', label: '다인실 생성' },
  { emoji: '📨', label: '초대 링크' },
  { emoji: '🌐', label: '리전 자동' },
  { emoji: '♾️', label: '인원 제한 해제' },
  { emoji: '🗑️', label: '통화방 삭제' },
];

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export async function generateVoiceInterfaceLegendImage(): Promise<AttachmentBuilder> {
  const width = 1400;
  const height = 640;
  const cols = 4;
  const padding = 34;
  const topOffset = 120;
  const gapX = 18;
  const gapY = 18;
  const tileWidth = Math.floor((width - padding * 2 - gapX * (cols - 1)) / cols);
  const tileHeight = 134;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#0b0f1a');
  bg.addColorStop(1, '#0f1523');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 50px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('VOICE INTERFACE', 38, 62);

  ctx.fillStyle = '#9ca3af';
  ctx.font = '500 24px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  ctx.fillText('버튼은 이모지만 표시되고, 아래 기능은 참고용 가이드입니다.', 40, 98);

  GUIDE_ITEMS.forEach((item, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const x = padding + col * (tileWidth + gapX);
    const y = topOffset + row * (tileHeight + gapY);

    roundedRect(ctx, x, y, tileWidth, tileHeight, 24);
    const tileGradient = ctx.createLinearGradient(x, y, x, y + tileHeight);
    tileGradient.addColorStop(0, '#1a202f');
    tileGradient.addColorStop(1, '#171c29');
    ctx.fillStyle = tileGradient;
    ctx.fill();

    ctx.strokeStyle = '#2b3246';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 46px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    ctx.fillText(item.emoji, x + 26, y + 84);

    ctx.fillStyle = '#f3f4f6';
    ctx.font = '700 44px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    ctx.fillText(item.label, x + 108, y + 85);
  });

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'voice-interface-guide.png' });
}
