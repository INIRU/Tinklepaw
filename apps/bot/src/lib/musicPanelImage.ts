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
const fontFamily = 'Pretendard, "Noto Sans CJK JP", "Noto Sans Math", "Noto Emoji", sans-serif';

const fontPath = fileURLToPath(new URL('../assets/fonts/Pretendard-Regular.ttf', import.meta.url));
const cjkFontPath = fileURLToPath(new URL('../assets/fonts/NotoSansCJKjp-Regular.otf', import.meta.url));
const mathFontPath = fileURLToPath(new URL('../assets/fonts/NotoSansMath-Regular.ttf', import.meta.url));
const emojiFontPath = fileURLToPath(new URL('../assets/fonts/NotoEmoji-Regular.ttf', import.meta.url));
registerFont(fontPath, { family: 'Pretendard', weight: '400' });
registerFont(fontPath, { family: 'Pretendard', weight: '600' });
registerFont(cjkFontPath, { family: 'Noto Sans CJK JP', weight: '400' });
registerFont(mathFontPath, { family: 'Noto Sans Math', weight: '400' });
registerFont(emojiFontPath, { family: 'Noto Emoji', weight: '400' });

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
  ctx.drawImage(image, x, y, size, size);
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
  gradient.addColorStop(0, '#0a0a12');
  gradient.addColorStop(0.45, '#0c0f1b');
  gradient.addColorStop(1, '#3a1b57');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const leftPanelX = panelPadding + 80;
  const leftPanelY = panelPadding + 24;
  const leftPanelWidth = 360;
  const leftPanelHeight = artSize + 160;
  const artX = leftPanelX + (leftPanelWidth - artSize) / 2;
  const artY = leftPanelY + 8;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 20;
  ctx.fillStyle = 'rgba(15,17,28,0.55)';
  drawRoundedRect(ctx, leftPanelX, leftPanelY, leftPanelWidth, leftPanelHeight, 24);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#1f2937';
  drawRoundedRect(ctx, artX, artY, artSize, artSize, 18);
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
  const titleStartY = artY + artSize + 24;
  const titleLineHeight = 22;
  const maxTitleLines = 3;
  const barY = leftPanelY + leftPanelHeight - 34;
  const maxTextBottom = barY - 12;
  const artistGap = 10;
  const artistLineHeight = 14;
  const availableHeight = Math.max(0, maxTextBottom - titleStartY);
  const maxLinesBySpace = Math.max(1, Math.min(maxTitleLines, Math.floor((availableHeight - (artistLineHeight + artistGap)) / titleLineHeight)));

  ctx.font = `600 18px ${fontFamily}`;
  const titleLines = wrapTextLines(ctx, params.title, textMaxWidth, maxLinesBySpace);
  const textCenterX = leftPanelX + leftPanelWidth / 2;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f3f4f6';
  titleLines.forEach((line, index) => {
    ctx.fillText(line, textCenterX, titleStartY + index * titleLineHeight);
  });

  const artistText = truncateText(ctx, params.artist ?? '알 수 없음', textMaxWidth);
  const artistY = titleStartY + titleLines.length * titleLineHeight + artistGap;
  ctx.fillStyle = '#b6b9c6';
  ctx.font = `12px ${fontFamily}`;
  ctx.fillText(artistText, textCenterX, artistY);

  const elapsed = formatDuration(params.positionMs ?? 0);
  const total = formatDuration(params.durationMs ?? 0);
  const barX = leftPanelX + 16;
  const barWidth = leftPanelWidth - 32;
  const barHeight = 6;
  const ratio = params.durationMs && params.durationMs > 0 ? Math.min(1, (params.positionMs ?? 0) / params.durationMs) : 0;

  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  drawRoundedRect(ctx, barX, barY, barWidth, barHeight, 3);
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  drawRoundedRect(ctx, barX, barY, Math.max(8, barWidth * ratio), barHeight, 3);
  ctx.fill();

  ctx.fillStyle = '#cbd5f5';
  ctx.font = `11px ${fontFamily}`;
  ctx.textAlign = 'left';
  ctx.fillText(elapsed, barX, barY + 20);
  ctx.textAlign = 'right';
  ctx.fillText(total, barX + barWidth, barY + 20);
  ctx.textAlign = 'left';

  const queueX = leftPanelX + leftPanelWidth + 64;
  const queueY = leftPanelY + 10;
  const queueWidth = canvasWidth - queueX - panelPadding - 20;

  ctx.fillStyle = '#f5f5f9';
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
      ctx.fillStyle = 'rgba(30,32,45,0.85)';
      drawRoundedRect(ctx, queueX, y, queueWidth, 58, 14);
      ctx.fill();
      ctx.restore();

      const thumbX = queueX + 12;
      const thumbY = y + 7;
      ctx.fillStyle = '#1f2937';
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
      ctx.fillStyle = '#f3f4f6';
      ctx.font = `600 13px ${fontFamily}`;
      ctx.fillText(truncateText(ctx, track.title, titleWidth), titleX, y + 26);
      ctx.fillStyle = '#a6a9b8';
      ctx.font = `11px ${fontFamily}`;
      ctx.fillText(truncateText(ctx, track.author ?? '알 수 없음', titleWidth), titleX, y + 44);

      const duration = formatDuration(track.length ?? 0);
      ctx.fillStyle = '#d1d5db';
      ctx.font = `11px ${fontFamily}`;
      const durationWidth = ctx.measureText(duration).width;
      ctx.fillText(duration, queueX + queueWidth - durationWidth - 14, y + 26);

      y += 68;
    }
  }

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'music-panel.png' });
};
