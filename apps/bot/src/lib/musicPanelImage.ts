import { createCanvas, loadImage, registerFont } from 'canvas';
import type { CanvasRenderingContext2D, Image } from 'canvas';
import { AttachmentBuilder } from 'discord.js';
import { fileURLToPath } from 'url';

import { formatDuration } from '../services/music.js';

type QueueTrack = {
  title: string;
  author?: string | null;
  thumbnail?: string | null;
  length?: number | null;
};

type MusicPanelParams = {
  title: string;
  artist?: string | null;
  artworkUrl?: string | null;
  durationMs?: number | null;
  positionMs?: number | null;
  queue: QueueTrack[];
};

const canvasWidth = 1200;
const canvasHeight = 480;
const panelPadding = 32;
const artSize = 240;
const queueThumbSize = 44;
const fontFamily = 'Pretendard, "Noto Sans CJK JP", "Noto Sans Symbols 2", "Noto Sans Math", sans-serif';
const numberFontFamily = 'Pretendard, sans-serif';

const fontPath = fileURLToPath(new URL('../assets/fonts/Pretendard-Regular.ttf', import.meta.url));
const cjkFontPath = fileURLToPath(new URL('../assets/fonts/NotoSansCJKjp-VF.ttf', import.meta.url));
const symbolsFontPath = fileURLToPath(new URL('../assets/fonts/NotoSansSymbols2-Regular.ttf', import.meta.url));
const mathFontPath = fileURLToPath(new URL('../assets/fonts/NotoSansMath-Regular.ttf', import.meta.url));

const safeRegisterFont = (src: string, options: Parameters<typeof registerFont>[1]) => {
  try {
    registerFont(src, options);
  } catch (error) {
    console.warn('[MusicPanel] Failed to register font:', options.family, error);
  }
};

safeRegisterFont(fontPath, { family: 'Pretendard', weight: '400' });
safeRegisterFont(fontPath, { family: 'Pretendard', weight: '600' });
safeRegisterFont(cjkFontPath, { family: 'Noto Sans CJK JP', weight: '400' });
safeRegisterFont(symbolsFontPath, { family: 'Noto Sans Symbols 2', weight: '400' });
safeRegisterFont(mathFontPath, { family: 'Noto Sans Math', weight: '400' });

const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

const drawRoundedImage = (ctx: CanvasRenderingContext2D, image: Image, x: number, y: number, size: number, radius: number) => {
  ctx.save();
  drawRoundedRect(ctx, x, y, size, size, radius);
  ctx.clip();

  const scale = Math.max(size / image.width, size / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = x + (size - drawWidth) / 2;
  const offsetY = y + (size - drawHeight) / 2;
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  ctx.restore();
};

const truncateText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let output = text;
  while (output.length > 0 && ctx.measureText(`${output}…`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output}…`;
};

const wrapTextLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) => {
  const lines: string[] = [];
  const words = text.split(/\s+/).filter(Boolean);
  let truncated = false;

  if (words.length <= 1) {
    let line = '';
    for (const char of text) {
      const testLine = `${line}${char}`;
      if (ctx.measureText(testLine).width <= maxWidth) {
        line = testLine;
        continue;
      }
      if (line) lines.push(line);
      line = char;
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
    }
    if (!truncated && line) lines.push(line);
    if (truncated && lines.length) {
      lines[lines.length - 1] = truncateText(ctx, lines[lines.length - 1], maxWidth);
    }
    return lines.slice(0, maxLines);
  }

  let line = '';
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      line = testLine;
      continue;
    }

    if (line) lines.push(line);
    line = word;
    if (lines.length >= maxLines) {
      truncated = true;
      break;
    }
  }

  if (!truncated && line) lines.push(line);
  if (truncated && lines.length) {
    lines[lines.length - 1] = truncateText(ctx, lines[lines.length - 1], maxWidth);
  }

  return lines.slice(0, maxLines);
};

export const buildMusicPanelImage = async (params: MusicPanelParams) => {
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  gradient.addColorStop(0, '#0b0f0d');
  gradient.addColorStop(0.5, '#0f1412');
  gradient.addColorStop(1, '#0e1311');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const glow = ctx.createRadialGradient(180, 120, 40, 180, 120, 300);
  glow.addColorStop(0, 'rgba(29,185,84,0.35)');
  glow.addColorStop(1, 'rgba(29,185,84,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const leftPanelX = panelPadding + 80;
  const leftPanelY = panelPadding + 24;
  const leftPanelWidth = 360;
  const leftPanelHeight = artSize + 160;
  const artX = leftPanelX + (leftPanelWidth - artSize) / 2;
  const artY = leftPanelY + 8;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 22;
  ctx.fillStyle = 'rgba(20,24,22,0.7)';
  drawRoundedRect(ctx, leftPanelX, leftPanelY, leftPanelWidth, leftPanelHeight, 26);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#0f1311';
  drawRoundedRect(ctx, artX, artY, artSize, artSize, 20);
  ctx.fill();

  if (params.artworkUrl) {
    try {
      const artwork = await loadImage(params.artworkUrl);
      drawRoundedImage(ctx, artwork, artX, artY, artSize, 18);
    } catch (error) {
      console.warn('[MusicPanel] Failed to load artwork:', params.artworkUrl, error);
    }
  }

  const textMaxWidth = leftPanelWidth - 32;
  const titleStartY = artY + artSize + 36;
  const titleLineHeight = 22;
  const maxTitleLines = 3;
  const barY = leftPanelY + leftPanelHeight - 34;
  const maxTextBottom = barY - 12;
  const artistGap = 10;
  const artistLineHeight = 14;
  const availableHeight = Math.max(0, maxTextBottom - titleStartY);
  const maxLinesBySpace = Math.max(1, Math.min(maxTitleLines, Math.floor((availableHeight - (artistLineHeight + artistGap)) / titleLineHeight)));

  const textCenterX = leftPanelX + leftPanelWidth / 2;
  const labelGap = 8;
  const labelHeight = 12;
  ctx.textAlign = 'center';
  ctx.font = `700 10px ${numberFontFamily}`;
  ctx.fillStyle = '#1db954';
  ctx.fillText('NOW PLAYING', textCenterX, titleStartY - (labelGap + labelHeight));

  ctx.font = `600 18px ${fontFamily}`;
  const titleLines = wrapTextLines(ctx, params.title, textMaxWidth, maxLinesBySpace);
  ctx.fillStyle = '#f8fafc';
  titleLines.forEach((line, index) => {
    ctx.fillText(line, textCenterX, titleStartY + index * titleLineHeight);
  });

  const artistText = truncateText(ctx, params.artist ?? '알 수 없음', textMaxWidth);
  const artistY = titleStartY + titleLines.length * titleLineHeight + artistGap;
  ctx.fillStyle = '#a3a3a3';
  ctx.font = `12px ${fontFamily}`;
  ctx.fillText(artistText, textCenterX, artistY);

  const elapsed = formatDuration(params.positionMs ?? 0);
  const total = formatDuration(params.durationMs ?? 0);
  const barX = leftPanelX + 16;
  const barWidth = leftPanelWidth - 32;
  const barHeight = 6;
  const ratio = params.durationMs && params.durationMs > 0 ? Math.min(1, (params.positionMs ?? 0) / params.durationMs) : 0;

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  drawRoundedRect(ctx, barX, barY, barWidth, barHeight, 3);
  ctx.fill();
  ctx.fillStyle = '#1db954';
  drawRoundedRect(ctx, barX, barY, Math.max(8, barWidth * ratio), barHeight, 3);
  ctx.fill();

  ctx.fillStyle = '#a1a1aa';
  ctx.font = `11px ${numberFontFamily}`;
  ctx.textAlign = 'left';
  ctx.fillText(elapsed, barX, barY + 20);
  ctx.textAlign = 'right';
  ctx.fillText(total, barX + barWidth, barY + 20);
  ctx.textAlign = 'left';

  const queueX = leftPanelX + leftPanelWidth + 64;
  const queueY = leftPanelY + 10;
  const queueWidth = canvasWidth - queueX - panelPadding - 20;

  ctx.fillStyle = '#e2e8f0';
  ctx.font = `600 16px ${fontFamily}`;
  ctx.fillText('대기열', queueX, queueY);

  const list = params.queue.slice(0, 4);
  if (list.length === 0) {
    ctx.fillStyle = '#9ca3af';
    ctx.font = `12px ${fontFamily}`;
    ctx.fillText('대기열이 비어있어요.', queueX, queueY + 24);
  } else {
    let y = queueY + 22;
    for (const track of list) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(19,22,24,0.9)';
      drawRoundedRect(ctx, queueX, y, queueWidth, 58, 14);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#1db954';
      ctx.fillRect(queueX + 10, y + 10, 3, 38);

      const thumbX = queueX + 12;
      const thumbY = y + 7;
      ctx.fillStyle = '#0f1311';
      drawRoundedRect(ctx, thumbX, thumbY, queueThumbSize, queueThumbSize, 8);
      ctx.fill();

      if (track.thumbnail) {
        try {
          const art = await loadImage(track.thumbnail);
          drawRoundedImage(ctx, art, thumbX, thumbY, queueThumbSize, 8);
        } catch (error) {
          console.warn('[MusicPanel] Failed to load thumbnail:', track.thumbnail, error);
        }
      }

      const titleX = thumbX + queueThumbSize + 12;
      const titleWidth = queueWidth - (titleX - queueX) - 58;
      ctx.fillStyle = '#f8fafc';
      ctx.font = `600 13px ${fontFamily}`;
      ctx.fillText(truncateText(ctx, track.title, titleWidth), titleX, y + 26);
      ctx.fillStyle = '#9ca3af';
      ctx.font = `11px ${numberFontFamily}`;
      ctx.fillText(truncateText(ctx, track.author ?? '알 수 없음', titleWidth), titleX, y + 44);

      const duration = formatDuration(track.length ?? 0);
      ctx.fillStyle = '#d4d4d8';
      ctx.font = `11px ${numberFontFamily}`;
      const durationWidth = ctx.measureText(duration).width;
      ctx.fillText(duration, queueX + queueWidth - durationWidth - 14, y + 26);

      y += 68;
    }

    const overflowCount = params.queue.length - list.length;
    if (overflowCount > 0) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = `11px ${fontFamily}`;
      ctx.fillText(`외 ${overflowCount}개 대기열이 있습니다.`, queueX, y + 6);
    }
  }

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'music-panel.png' });
};
