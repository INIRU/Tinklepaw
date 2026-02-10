import { createCanvas, CanvasRenderingContext2D, registerFont } from 'canvas';
import { AttachmentBuilder } from 'discord.js';
import { fileURLToPath } from 'url';

type GachaResult = {
  name: string;
  rarity: 'R' | 'S' | 'SS' | 'SSS';
  discord_role_id?: string | null;
  refund_points?: number;
};

const RARITY_COLORS = {
  SSS: '#FFD700',
  SS: '#FF69B4',
  S: '#9B59B6',
  R: '#95A5A6'
};

const RARITY_GLOW = {
  SSS: '#FFA500',
  SS: '#FF1493',
  S: '#8B008B',
  R: '#708090'
};

const textFontFamily =
  'Pretendard, "Noto Sans", "Noto Sans CJK JP", "Noto Sans Elbasan", "Noto Sans Symbols 2", "Noto Sans Math", "Noto Color Emoji", sans-serif';

const pretendardPath = fileURLToPath(new URL('../assets/fonts/Pretendard-Regular.ttf', import.meta.url));
const notoSansPath = fileURLToPath(new URL('../assets/fonts/NotoSans-Regular.ttf', import.meta.url));
const cjkPath = fileURLToPath(new URL('../assets/fonts/NotoSansCJKjp-VF.ttf', import.meta.url));
const elbasanPath = fileURLToPath(new URL('../assets/fonts/NotoSansElbasan-Regular.ttf', import.meta.url));
const symbolsPath = fileURLToPath(new URL('../assets/fonts/NotoSansSymbols2-Regular.ttf', import.meta.url));
const mathPath = fileURLToPath(new URL('../assets/fonts/NotoSansMath-Regular.ttf', import.meta.url));
const emojiPath = fileURLToPath(new URL('../assets/fonts/NotoColorEmoji.ttf', import.meta.url));

const safeRegisterFont = (src: string, options: Parameters<typeof registerFont>[1]) => {
  try {
    registerFont(src, options);
  } catch (error) {
    console.warn('[GachaImage] Failed to register font:', options.family, error);
  }
};

safeRegisterFont(pretendardPath, { family: 'Pretendard', weight: '400' });
safeRegisterFont(pretendardPath, { family: 'Pretendard', weight: '700' });
safeRegisterFont(notoSansPath, { family: 'Noto Sans', weight: '400' });
safeRegisterFont(notoSansPath, { family: 'Noto Sans', weight: '700' });
safeRegisterFont(cjkPath, { family: 'Noto Sans CJK JP', weight: '400' });
safeRegisterFont(elbasanPath, { family: 'Noto Sans Elbasan', weight: '400' });
safeRegisterFont(symbolsPath, { family: 'Noto Sans Symbols 2', weight: '400' });
safeRegisterFont(mathPath, { family: 'Noto Sans Math', weight: '400' });
safeRegisterFont(emojiPath, { family: 'Noto Color Emoji', weight: '400' });

export async function generateGachaResultImage(
  results: GachaResult[],
  poolName: string
): Promise<AttachmentBuilder> {
  const isSingle = results.length === 1;
  const itemsPerRow = isSingle ? 1 : 5;
  const rows = Math.ceil(results.length / itemsPerRow);
  
  const itemWidth = 140;
  const itemHeight = 150;
  const itemSpacing = 20;
  const headerHeight = 80;
  const padding = 30;
  
  const width = isSingle ? 600 : (itemWidth * itemsPerRow + itemSpacing * (itemsPerRow - 1) + padding * 2);
  const height = isSingle ? 450 : (headerHeight + itemHeight * rows + itemSpacing * (rows - 1) + padding);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 28px ${textFontFamily}`;
  ctx.textAlign = 'center';
  ctx.fillText(poolName, width / 2, 40);

  if (isSingle) {
    const result = results[0];
    const centerX = width / 2;
    const centerY = height / 2 + 20;

    ctx.shadowColor = RARITY_GLOW[result.rarity];
    ctx.shadowBlur = 40;
    ctx.fillStyle = RARITY_COLORS[result.rarity];
    ctx.fillRect(centerX - 250, centerY - 80, 500, 160);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 48px ${textFontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(result.rarity, centerX, centerY - 30);

    ctx.font = `700 32px ${textFontFamily}`;
    ctx.fillText(result.name, centerX, centerY + 20);

    if (result.refund_points && result.refund_points > 0) {
      ctx.font = `400 20px ${textFontFamily}`;
      ctx.fillStyle = '#ffeb3b';
      ctx.fillText(`중복 환불: +${result.refund_points}p`, centerX, centerY + 60);
    }
  } else {
    const startX = padding;
    const startY = headerHeight;

    results.forEach((result, index) => {
      const row = Math.floor(index / itemsPerRow);
      const col = index % itemsPerRow;
      const x = startX + col * (itemWidth + itemSpacing);
      const y = startY + row * (itemHeight + itemSpacing);

      ctx.shadowColor = RARITY_GLOW[result.rarity];
      ctx.shadowBlur = 20;
      ctx.fillStyle = RARITY_COLORS[result.rarity];
      ctx.fillRect(x, y, itemWidth, itemHeight);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#ffffff';
      ctx.font = `700 20px ${textFontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(result.rarity, x + itemWidth / 2, y + 25);

      ctx.font = `400 14px ${textFontFamily}`;
      const nameLines = wrapText(ctx, result.name, itemWidth - 10);
      nameLines.forEach((line, i) => {
        ctx.fillText(line, x + itemWidth / 2, y + 50 + i * 18);
      });

      if (result.refund_points && result.refund_points > 0) {
        ctx.font = `400 11px ${textFontFamily}`;
        ctx.fillStyle = '#ffeb3b';
        ctx.fillText(`+${result.refund_points}p`, x + itemWidth / 2, y + itemHeight - 10);
      }
    });
  }

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'gacha-result.png' });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split('');
  const lines: string[] = [];
  let currentLine = '';

  for (const char of words) {
    const testLine = currentLine + char;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine !== '') {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, 3);
}
