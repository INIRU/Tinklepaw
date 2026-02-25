import { createCanvas, CanvasRenderingContext2D, registerFont } from 'canvas';
import { AttachmentBuilder } from 'discord.js';
import { fileURLToPath } from 'url';

export type GachaResult = {
  name: string;
  rarity: 'R' | 'S' | 'SS' | 'SSS';
  discord_role_id?: string | null;
  refund_points?: number;
};

// ── Brand / rarity colours — matches embed.ts & web globals.css ───────────────
const RARITY_HEX: Record<GachaResult['rarity'], string> = {
  SSS: '#fbbf24',  // amber  — RARITY_SSS
  SS:  '#a855f7',  // violet — RARITY_SS
  S:   '#3b82f6',  // sky    — RARITY_S
  R:   '#94a3b8',  // slate  — RARITY_R
};

const RARITY_GLOW_ALPHA: Record<GachaResult['rarity'], number> = {
  SSS: 0.6,
  SS:  0.55,
  S:   0.45,
  R:   0.25,
};

const RARITY_EMOJI: Record<GachaResult['rarity'], string> = {
  SSS: '🌈',
  SS:  '💎',
  S:   '✨',
  R:   '🔹',
};

const BG_TOP = '#0e0e1c';
const BG_BOT = '#09090f';
const CARD_BG = '#141426';
const TEXT_WHITE = '#f0f0ff';
const TEXT_MUTED = '#6b6b9a';
const REFUND_COL = '#fbbf24';

const FONT =
  'Pretendard, "Noto Sans", "Noto Sans CJK JP", "Noto Sans Elbasan", "Noto Sans Symbols 2", "Noto Sans Math", "Noto Color Emoji", sans-serif';

// ── Font registration ─────────────────────────────────────────────────────────
const pretendardPath = fileURLToPath(new URL('../assets/fonts/Pretendard-Regular.ttf', import.meta.url));
const notoSansPath   = fileURLToPath(new URL('../assets/fonts/NotoSans-Regular.ttf', import.meta.url));
const cjkPath        = fileURLToPath(new URL('../assets/fonts/NotoSansCJKjp-VF.ttf', import.meta.url));
const elbasanPath    = fileURLToPath(new URL('../assets/fonts/NotoSansElbasan-Regular.ttf', import.meta.url));
const symbolsPath    = fileURLToPath(new URL('../assets/fonts/NotoSansSymbols2-Regular.ttf', import.meta.url));
const mathPath       = fileURLToPath(new URL('../assets/fonts/NotoSansMath-Regular.ttf', import.meta.url));
const emojiPath      = fileURLToPath(new URL('../assets/fonts/NotoColorEmoji.ttf', import.meta.url));

const safeRegisterFont = (src: string, options: Parameters<typeof registerFont>[1]) => {
  try { registerFont(src, options); }
  catch (e) { console.warn('[GachaImage] font registration failed:', options.family, e); }
};

safeRegisterFont(pretendardPath, { family: 'Pretendard', weight: '400' });
safeRegisterFont(pretendardPath, { family: 'Pretendard', weight: '700' });
safeRegisterFont(notoSansPath,   { family: 'Noto Sans',  weight: '400' });
safeRegisterFont(notoSansPath,   { family: 'Noto Sans',  weight: '700' });
safeRegisterFont(cjkPath,        { family: 'Noto Sans CJK JP', weight: '400' });
safeRegisterFont(elbasanPath,    { family: 'Noto Sans Elbasan', weight: '400' });
safeRegisterFont(symbolsPath,    { family: 'Noto Sans Symbols 2', weight: '400' });
safeRegisterFont(mathPath,       { family: 'Noto Sans Math', weight: '400' });
safeRegisterFont(emojiPath,      { family: 'Noto Color Emoji', weight: '400' });

// ── Utility helpers ───────────────────────────────────────────────────────────
function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

function drawBg(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, BG_TOP);
  g.addColorStop(1, BG_BOT);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const chars = [...text];
  const lines: string[] = [];
  let line = '';
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

// ── Card renderer (used by multi-pull grid) ───────────────────────────────────
function drawCard(
  ctx: CanvasRenderingContext2D,
  result: GachaResult,
  x: number, y: number, w: number, h: number,
) {
  const col = RARITY_HEX[result.rarity];
  const glowA = RARITY_GLOW_ALPHA[result.rarity];
  const R = 12;

  ctx.save();

  // Drop glow for SSS / SS
  if (result.rarity === 'SSS' || result.rarity === 'SS') {
    ctx.shadowColor = rgba(col, glowA);
    ctx.shadowBlur  = result.rarity === 'SSS' ? 22 : 14;
  }
  rrect(ctx, x, y, w, h, R);
  ctx.fillStyle = CARD_BG;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Rarity tint gradient (top → transparent)
  const tint = ctx.createLinearGradient(x, y, x, y + h * 0.55);
  tint.addColorStop(0, rgba(col, 0.14));
  tint.addColorStop(1, 'rgba(0,0,0,0)');
  rrect(ctx, x, y, w, h, R);
  ctx.fillStyle = tint;
  ctx.fill();

  // Border
  rrect(ctx, x, y, w, h, R);
  ctx.strokeStyle = rgba(col, 0.45);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Top accent strip (4 px, rounded top)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + R, y);
  ctx.lineTo(x + w - R, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + R);
  ctx.lineTo(x + w, y + 4);
  ctx.lineTo(x, y + 4);
  ctx.lineTo(x, y + R);
  ctx.quadraticCurveTo(x, y, x + R, y);
  ctx.closePath();
  const accent = ctx.createLinearGradient(x, y, x + w, y);
  accent.addColorStop(0,   rgba(col, 0.5));
  accent.addColorStop(0.5, col);
  accent.addColorStop(1,   rgba(col, 0.5));
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();

  const cx = x + w / 2;

  // Emoji
  ctx.textAlign = 'center';
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = TEXT_WHITE;
  ctx.fillText(RARITY_EMOJI[result.rarity], cx, y + 28);

  // Rarity label
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = col;
  ctx.fillText(result.rarity, cx, y + 44);

  // Separator
  ctx.beginPath();
  ctx.moveTo(x + 14, y + 52);
  ctx.lineTo(x + w - 14, y + 52);
  ctx.strokeStyle = rgba(col, 0.22);
  ctx.lineWidth = 0.75;
  ctx.stroke();

  // Item name
  ctx.font = `400 12px ${FONT}`;
  ctx.fillStyle = TEXT_WHITE;
  const lines = wrapText(ctx, result.name, w - 18);
  lines.forEach((ln, i) => ctx.fillText(ln, cx, y + 68 + i * 16));

  // Refund
  if (result.refund_points && result.refund_points > 0) {
    ctx.font = `400 10px ${FONT}`;
    ctx.fillStyle = REFUND_COL;
    ctx.fillText(`+${result.refund_points}p`, cx, y + h - 9);
  }

  ctx.restore();
}

// ── Multi-pull (10-pull grid) ─────────────────────────────────────────────────
function buildMulti(results: GachaResult[], poolName: string): AttachmentBuilder {
  const COLS     = 5;
  const ROWS     = Math.ceil(results.length / COLS);
  const CARD_W   = 150;
  const CARD_H   = 178;
  const GAP      = 10;
  const PAD_X    = 22;
  const HEADER_H = 60;
  const FOOTER_H = 18;

  const W = PAD_X * 2 + CARD_W * COLS + GAP * (COLS - 1);
  const H = HEADER_H + ROWS * CARD_H + (ROWS - 1) * GAP + FOOTER_H;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  drawBg(ctx, W, H);

  // Pool name
  ctx.textAlign  = 'center';
  ctx.font       = `700 20px ${FONT}`;
  ctx.fillStyle  = TEXT_WHITE;
  ctx.fillText(poolName, W / 2, 30);

  // Sub-label
  ctx.font      = `400 11px ${FONT}`;
  ctx.fillStyle = TEXT_MUTED;
  ctx.fillText(`${results.length}연 결과`, W / 2, 48);

  // Cards
  for (let i = 0; i < results.length; i++) {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const x   = PAD_X + col * (CARD_W + GAP);
    const y   = HEADER_H + row * (CARD_H + GAP);
    drawCard(ctx, results[i], x, y, CARD_W, CARD_H);
  }

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'gacha-result.png' });
}

// ── Single-pull (large dramatic card) ────────────────────────────────────────
function buildSingle(result: GachaResult, poolName: string): AttachmentBuilder {
  const W      = 560;
  const H      = 340;
  const CW     = 480;
  const CH     = 200;
  const CX     = (W - CW) / 2;
  const CY     = 90;
  const col    = RARITY_HEX[result.rarity];
  const glowA  = RARITY_GLOW_ALPHA[result.rarity];
  const glowB  = result.rarity === 'SSS' ? 44 : result.rarity === 'SS' ? 28 : result.rarity === 'S' ? 18 : 8;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  drawBg(ctx, W, H);

  // Ambient radial glow behind card
  const radial = ctx.createRadialGradient(W / 2, CY + CH / 2, 0, W / 2, CY + CH / 2, CW * 0.65);
  radial.addColorStop(0, rgba(col, 0.14));
  radial.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, W, H);

  // Pool name
  ctx.textAlign  = 'center';
  ctx.font       = `700 17px ${FONT}`;
  ctx.fillStyle  = TEXT_WHITE;
  ctx.fillText(poolName, W / 2, 34);

  ctx.font      = `400 11px ${FONT}`;
  ctx.fillStyle = TEXT_MUTED;
  ctx.fillText('뽑기 결과', W / 2, 50);

  // Card glow
  ctx.save();
  ctx.shadowColor = rgba(col, glowA);
  ctx.shadowBlur  = glowB;
  rrect(ctx, CX, CY, CW, CH, 16);
  ctx.fillStyle = CARD_BG;
  ctx.fill();
  ctx.restore();

  // Rarity gradient overlay
  const cardGrad = ctx.createLinearGradient(CX, CY, CX, CY + CH);
  cardGrad.addColorStop(0,   rgba(col, 0.20));
  cardGrad.addColorStop(0.4, rgba(col, 0.07));
  cardGrad.addColorStop(1,   'rgba(0,0,0,0)');
  rrect(ctx, CX, CY, CW, CH, 16);
  ctx.fillStyle = cardGrad;
  ctx.fill();

  // Border
  rrect(ctx, CX, CY, CW, CH, 16);
  ctx.strokeStyle = rgba(col, 0.55);
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // Top accent strip (5 px, fade-in/out horizontally)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(CX + 16, CY);
  ctx.lineTo(CX + CW - 16, CY);
  ctx.quadraticCurveTo(CX + CW, CY, CX + CW, CY + 16);
  ctx.lineTo(CX + CW, CY + 5);
  ctx.lineTo(CX, CY + 5);
  ctx.lineTo(CX, CY + 16);
  ctx.quadraticCurveTo(CX, CY, CX + 16, CY);
  ctx.closePath();
  const accentG = ctx.createLinearGradient(CX, CY, CX + CW, CY);
  accentG.addColorStop(0,   rgba(col, 0));
  accentG.addColorStop(0.25, col);
  accentG.addColorStop(0.75, col);
  accentG.addColorStop(1,   rgba(col, 0));
  ctx.fillStyle = accentG;
  ctx.fill();
  ctx.restore();

  // Rarity pill badge
  const badgeW = 110;
  const badgeH = 28;
  const badgeX = W / 2 - badgeW / 2;
  const badgeY = CY + 32;

  rrect(ctx, badgeX, badgeY, badgeW, badgeH, 14);
  ctx.fillStyle = rgba(col, 0.18);
  ctx.fill();
  rrect(ctx, badgeX, badgeY, badgeW, badgeH, 14);
  ctx.strokeStyle = rgba(col, 0.55);
  ctx.lineWidth   = 1;
  ctx.stroke();

  ctx.textAlign  = 'center';
  ctx.font       = `700 14px ${FONT}`;
  ctx.fillStyle  = col;
  ctx.fillText(`${RARITY_EMOJI[result.rarity]} ${result.rarity}`, W / 2, badgeY + 18);

  // Item name
  ctx.font      = `700 30px ${FONT}`;
  ctx.fillStyle = TEXT_WHITE;
  const nameLines = wrapText(ctx, result.name, CW - 60);
  const nameBaseY = CY + 100;
  nameLines.forEach((ln, i) => ctx.fillText(ln, W / 2, nameBaseY + i * 36));

  // Refund
  if (result.refund_points && result.refund_points > 0) {
    ctx.font      = `400 14px ${FONT}`;
    ctx.fillStyle = REFUND_COL;
    ctx.fillText(`중복 환불 +${result.refund_points}p`, W / 2, CY + CH - 14);
  }

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'gacha-result.png' });
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function generateGachaResultImage(
  results: GachaResult[],
  poolName: string,
): Promise<AttachmentBuilder> {
  return results.length === 1
    ? buildSingle(results[0], poolName)
    : buildMulti(results, poolName);
}
