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
  requesterName?: string | null;
  requesterAvatarUrl?: string | null;
};

type MusicPanelParams = {
  title: string;
  artist?: string | null;
  artworkUrl?: string | null;
  durationMs?: number | null;
  positionMs?: number | null;
  queue: QueueTrack[];
  autoplayEnabled?: boolean;
  filterLabel?: string;
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

const drawCircleImage = (ctx: CanvasRenderingContext2D, image: Image, x: number, y: number, size: number) => {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const scale = Math.max(size / image.width, size / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = x + (size - drawWidth) / 2;
  const offsetY = y + (size - drawHeight) / 2;
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  ctx.restore();
};

const drawChip = (ctx: CanvasRenderingContext2D, x: number, y: number, text: string, tone: 'green' | 'slate') => {
  ctx.font = `600 10px ${numberFontFamily}`;
  const textWidth = ctx.measureText(text).width;
  const width = textWidth + 18;
  const height = 18;
  const radius = 9;
  const bg = tone === 'green' ? 'rgba(29,185,84,0.24)' : 'rgba(100,116,139,0.28)';
  const border = tone === 'green' ? 'rgba(110,231,183,0.45)' : 'rgba(203,213,225,0.28)';
  const fg = tone === 'green' ? '#a7f3d0' : '#e2e8f0';
  ctx.fillStyle = bg;
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.fillText(text, x + 9, y + 12);
  return width;
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
  gradient.addColorStop(0, '#09130f');
  gradient.addColorStop(0.5, '#0e1716');
  gradient.addColorStop(1, '#111a1a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const glow = ctx.createRadialGradient(180, 120, 40, 180, 120, 300);
  glow.addColorStop(0, 'rgba(29,185,84,0.36)');
  glow.addColorStop(1, 'rgba(29,185,84,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const skyGlow = ctx.createRadialGradient(canvasWidth - 220, canvasHeight - 80, 40, canvasWidth - 220, canvasHeight - 80, 320);
  skyGlow.addColorStop(0, 'rgba(96,165,250,0.20)');
  skyGlow.addColorStop(1, 'rgba(96,165,250,0)');
  ctx.fillStyle = skyGlow;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const leftPanelX = panelPadding + 80;
  const leftPanelY = panelPadding + 24;
  const leftPanelWidth = 360;
  const leftPanelHeight = artSize + 160;
  const artX = leftPanelX + (leftPanelWidth - artSize) / 2;
  const artY = leftPanelY + 8;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.42)';
  ctx.shadowBlur = 24;
  const leftPanelGradient = ctx.createLinearGradient(leftPanelX, leftPanelY, leftPanelX, leftPanelY + leftPanelHeight);
  leftPanelGradient.addColorStop(0, 'rgba(16,22,21,0.86)');
  leftPanelGradient.addColorStop(1, 'rgba(13,18,18,0.80)');
  ctx.fillStyle = leftPanelGradient;
  drawRoundedRect(ctx, leftPanelX, leftPanelY, leftPanelWidth, leftPanelHeight, 26);
  ctx.fill();
  ctx.strokeStyle = 'rgba(226,232,240,0.14)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, leftPanelX, leftPanelY, leftPanelWidth, leftPanelHeight, 26);
  ctx.stroke();
  ctx.restore();

  const artworkShellGradient = ctx.createLinearGradient(artX, artY, artX + artSize, artY + artSize);
  artworkShellGradient.addColorStop(0, '#121b19');
  artworkShellGradient.addColorStop(1, '#0d1514');
  ctx.fillStyle = artworkShellGradient;
  drawRoundedRect(ctx, artX, artY, artSize, artSize, 20);
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.26)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, artX, artY, artSize, artSize, 20);
  ctx.stroke();

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
  const barY = leftPanelY + leftPanelHeight - 26;
  const maxTextBottom = barY - 12;
  const artistGap = 10;
  const artistLineHeight = 14;
  const availableHeight = Math.max(0, maxTextBottom - titleStartY);
  const maxLinesBySpace = Math.max(1, Math.min(maxTitleLines, Math.floor((availableHeight - (artistLineHeight + artistGap)) / titleLineHeight)));

  const textCenterX = leftPanelX + leftPanelWidth / 2;
  const labelGap = 8;
  const labelHeight = 12;
  ctx.textAlign = 'center';
  ctx.font = `700 11px ${numberFontFamily}`;
  ctx.fillStyle = '#6ee7b7';
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

  const chipY = Math.min(artistY + 12, barY - 30);
  const chipStartX = leftPanelX + 18;
  const autoplayLabel = params.autoplayEnabled === false ? 'AUTO OFF' : 'AUTO ON';
  const filterLabel = params.filterLabel ?? '필터 해제';
  const firstChipWidth = drawChip(ctx, chipStartX, chipY, autoplayLabel, params.autoplayEnabled === false ? 'slate' : 'green');
  drawChip(ctx, chipStartX + firstChipWidth + 8, chipY, filterLabel, 'slate');

  const elapsed = formatDuration(params.positionMs ?? 0);
  const total = formatDuration(params.durationMs ?? 0);
  const barX = leftPanelX + 16;
  const barWidth = leftPanelWidth - 32;
  const barHeight = 7;
  const ratio = params.durationMs && params.durationMs > 0 ? Math.min(1, (params.positionMs ?? 0) / params.durationMs) : 0;
  const progressWidth = Math.max(0, barWidth * ratio);

  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  drawRoundedRect(ctx, barX, barY, barWidth, barHeight, 3);
  ctx.fill();

  if (progressWidth > 0) {
    const progressGradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
    progressGradient.addColorStop(0, '#1db954');
    progressGradient.addColorStop(1, '#34d399');
    ctx.fillStyle = progressGradient;
    drawRoundedRect(ctx, barX, barY, Math.max(10, progressWidth), barHeight, 3);
    ctx.fill();

    const knobX = Math.min(barX + barWidth - 4, barX + Math.max(10, progressWidth));
    ctx.fillStyle = '#a7f3d0';
    ctx.beginPath();
    ctx.arc(knobX, barY + barHeight / 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

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
  ctx.font = `700 16px ${fontFamily}`;
  ctx.fillText(`대기열 · ${params.queue.length}곡`, queueX, queueY);
  ctx.fillStyle = '#94a3b8';
  ctx.font = `11px ${fontFamily}`;
  ctx.fillText('요청자와 곡 정보를 확인해보세요', queueX, queueY + 18);

  const list = params.queue.slice(0, 4);
  if (list.length === 0) {
    ctx.fillStyle = '#9ca3af';
    ctx.font = `12px ${fontFamily}`;
    ctx.fillText('대기열이 비어있어요.', queueX, queueY + 40);
  } else {
    let y = queueY + 34;
    for (let index = 0; index < list.length; index += 1) {
      const track = list[index];
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 12;
      const cardGradient = ctx.createLinearGradient(queueX, y, queueX, y + 66);
      cardGradient.addColorStop(0, 'rgba(22,28,30,0.96)');
      cardGradient.addColorStop(1, 'rgba(16,20,23,0.92)');
      ctx.fillStyle = cardGradient;
      drawRoundedRect(ctx, queueX, y, queueWidth, 66, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(148,163,184,0.2)';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, queueX, y, queueWidth, 66, 14);
      ctx.stroke();
      ctx.restore();

      const badgeX = queueX + 24;
      const badgeY = y + 20;
      ctx.fillStyle = 'rgba(29,185,84,0.26)';
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(134,239,172,0.44)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#bbf7d0';
      ctx.font = `700 10px ${numberFontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(index + 1), badgeX, badgeY + 3.5);
      ctx.textAlign = 'left';

      const thumbX = queueX + 42;
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
      const titleWidth = queueWidth - (titleX - queueX) - 92;
      ctx.fillStyle = '#f8fafc';
      ctx.font = `600 13px ${fontFamily}`;
      ctx.fillText(truncateText(ctx, track.title, titleWidth), titleX, y + 24);
      ctx.fillStyle = '#9ca3af';
      ctx.font = `11px ${numberFontFamily}`;
      ctx.fillText(truncateText(ctx, track.author ?? '알 수 없음', titleWidth), titleX, y + 38);

      const requesterName = track.requesterName ?? '알 수 없음';
      ctx.fillStyle = '#94a3b8';
      ctx.font = `10px ${fontFamily}`;
      ctx.fillText(truncateText(ctx, `요청: ${requesterName}`, titleWidth), titleX, y + 53);

      const duration = formatDuration(track.length ?? 0);
      ctx.fillStyle = '#d4d4d8';
      ctx.font = `11px ${numberFontFamily}`;
      const durationWidth = ctx.measureText(duration).width;
      const durationX = queueX + queueWidth - durationWidth - 14;
      ctx.fillText(duration, durationX, y + 24);

      if (track.requesterAvatarUrl) {
        try {
          const avatar = await loadImage(track.requesterAvatarUrl);
          drawCircleImage(ctx, avatar, queueX + queueWidth - 30, y + 38, 18);
          ctx.strokeStyle = 'rgba(203,213,225,0.45)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(queueX + queueWidth - 21, y + 47, 9, 0, Math.PI * 2);
          ctx.stroke();
        } catch {
          // ignore avatar load error
        }
      }

      y += 76;
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
