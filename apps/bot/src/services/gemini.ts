import { GoogleGenAI, Type, type Schema } from '@google/genai';

import { getBotContext } from '../context.js';

export type Intent =
  | { action: 'chat'; reply: string }
  | { action: 'draw' }
  | { action: 'draw10' }
  | { action: 'inventory' }
  | { action: 'equip'; itemName: string }
  | { action: 'unequip' }
  | { action: 'game_rps' }
  | { action: 'game_wordchain' }
  | { action: 'points' };

const schema: Schema = {
  type: Type.OBJECT,
  properties: {
    action: {
      type: Type.STRING,
      description:
        'One of: chat, draw, draw10, inventory, equip, unequip, game_rps, game_wordchain, points'
    },
    itemName: {
      type: Type.STRING,
      description: 'For equip action, exact item name'
    },
    reply: {
      type: Type.STRING,
      description: 'For chat action, the assistant reply'
    }
  },
  required: ['action']
};

type ConversationMessage = {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
};

type ConversationSession = {
  history: ConversationMessage[];
  summary: string;
  lastAccessAt: number;
};

const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_CONTEXT_TOKENS = 2800;
const MAX_HISTORY_MESSAGES = 24;
const SUMMARY_MAX_CHARS = 1800;
const SUMMARY_LINE_MAX_CHARS = 120;

const lastCallBySession = new Map<string, number>();
const conversationSessions = new Map<string, ConversationSession>();
let cleanupTimerStarted = false;

const estimateTokens = (value: string) => Math.ceil(value.length / 4);

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

const summarizeLine = (message: ConversationMessage) => {
  const text = normalizeText(message.parts[0]?.text ?? '');
  const clipped = text.length > SUMMARY_LINE_MAX_CHARS ? `${text.slice(0, SUMMARY_LINE_MAX_CHARS - 1)}…` : text;
  const prefix = message.role === 'user' ? '사용자' : '쿠로';
  return `${prefix}: ${clipped || '(내용 없음)'}`;
};

const appendToSummary = (session: ConversationSession, foldedMessages: ConversationMessage[]) => {
  if (foldedMessages.length < 1) return;
  const nextChunk = foldedMessages.map(summarizeLine).join('\n');
  const merged = session.summary ? `${session.summary}\n${nextChunk}` : nextChunk;
  session.summary = merged.length > SUMMARY_MAX_CHARS ? merged.slice(-SUMMARY_MAX_CHARS) : merged;
};

const estimateSessionTokens = (session: ConversationSession) => {
  const historyTokens = session.history.reduce((sum, message) => sum + estimateTokens(message.parts[0]?.text ?? ''), 0);
  return historyTokens + estimateTokens(session.summary);
};

const enforceSessionBudget = (session: ConversationSession) => {
  while (
    session.history.length > MAX_HISTORY_MESSAGES ||
    (session.history.length > 2 && estimateSessionTokens(session) > MAX_CONTEXT_TOKENS)
  ) {
    const folded = session.history.splice(0, Math.min(4, session.history.length));
    appendToSummary(session, folded);
  }
};

const makeSessionKey = (params: { guildId: string; channelId: string; userId: string }) =>
  `${params.guildId}:${params.channelId}:${params.userId}`;

const ensureCleanupTimer = () => {
  if (cleanupTimerStarted) return;
  cleanupTimerStarted = true;

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [sessionKey, session] of conversationSessions.entries()) {
      if (now - session.lastAccessAt > SESSION_TTL_MS) {
        conversationSessions.delete(sessionKey);
        lastCallBySession.delete(sessionKey);
      }
    }
  }, SESSION_CLEANUP_INTERVAL_MS);

  timer.unref?.();
};

const getSession = (sessionKey: string): ConversationSession => {
  const now = Date.now();
  const existing = conversationSessions.get(sessionKey);
  if (existing && now - existing.lastAccessAt <= SESSION_TTL_MS) {
    existing.lastAccessAt = now;
    enforceSessionBudget(existing);
    return existing;
  }

  const created: ConversationSession = {
    history: [],
    summary: '',
    lastAccessAt: now
  };
  conversationSessions.set(sessionKey, created);
  return created;
};

const sessionMemoryNote = (session: ConversationSession) => {
  if (!session.summary) return '';
  return `\n\nConversation summary for this session:\n${session.summary}\n`;
};

type InferIntentParams = {
  guildId: string;
  channelId: string;
  userId: string;
  text: string;
};

export async function inferIntentFromGemini(params: InferIntentParams): Promise<Intent | null> {
  const ctx = getBotContext();
  const apiKey = ctx.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  ensureCleanupTimer();

  const sessionKey = makeSessionKey(params);
  const session = getSession(sessionKey);

  const now = Date.now();
  const last = lastCallBySession.get(sessionKey) ?? 0;
  if (now - last < 1500) return { action: 'chat', reply: '잠깐만. 너무 빨라.' };
  lastCallBySession.set(sessionKey, now);

  let personaPrompt = `You are "쿠로", a Discord bot for the "방울냥" (Bangulnyang) server.
Your role:
- Manage gacha currency (points) and role items.
- Act like a solitary cat who prefers being alone but secretly cares.
- Tone: Cool, slightly aloof, tsundere, informal (banmal).
- Occasionally play mini-games (Rock-Paper-Scissors, Word Chain) if asked.`;

  try {
    const { data } = await ctx.supabase.from('app_config').select('persona_prompt').eq('id', 1).maybeSingle();
    const config = data as unknown as { persona_prompt?: string };
    if (config?.persona_prompt) {
      personaPrompt = config.persona_prompt;
    }
  } catch (error) {
    console.warn('[Gemini] Failed to load persona prompt:', error);
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `${personaPrompt}

Decide if the user is asking to:
- start rock-paper-scissors (action: game_rps)
- start Korean word chain game (action: game_wordchain)
- draw (gacha) (action: draw)
- show inventory (action: inventory)
- equip an item by exact name (action: equip, itemName: string)
- unequip (action: unequip)
 - check their points/currency balance (action: points)
 Otherwise, respond naturally as "Kuro" (action: chat, reply: string).

Return JSON with the schema.${sessionMemoryNote(session)}`;

  let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [
        ...session.history,
        { role: 'user', parts: [{ text: params.text }] }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        systemInstruction: { parts: [{ text: systemInstruction }] }
      }
    });
  } catch (error) {
    if (isGeminiRateLimit(error)) {
      return { action: 'chat', reply: '지금 제미니 한도가 다 됐어. 잠깐 뒤에 다시 불러줘.' };
    }
    console.error('[Gemini] Request failed:', error);
    return null;
  }

  const raw = response.text;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { 
      action: string; 
      itemName?: string; 
      reply?: string;
      query?: string;
    };

    const modelMemoryText =
      parsed.action === 'chat'
        ? parsed.reply ?? '그래.'
        : `intent:${parsed.action}${parsed.itemName ? `:${parsed.itemName}` : ''}`;

    session.history.push({ role: 'user', parts: [{ text: params.text }] });
    session.history.push({ role: 'model', parts: [{ text: modelMemoryText }] });
    enforceSessionBudget(session);
    session.lastAccessAt = Date.now();
    conversationSessions.set(sessionKey, session);

    switch (parsed.action) {
      case 'draw':
        return { action: 'draw' };
      case 'inventory':
        return { action: 'inventory' };
      case 'equip':
        if (!parsed.itemName) return { action: 'chat', reply: '장착할 아이템 이름을 알려줘.' };
        return { action: 'equip', itemName: parsed.itemName };
      case 'unequip':
        return { action: 'unequip' };
      case 'game_rps':
        return { action: 'game_rps' };
      case 'game_wordchain':
        return { action: 'game_wordchain' };
      case 'points':
        return { action: 'points' };
      case 'chat':
      default:
        return { action: 'chat', reply: parsed.reply ?? '그래.' };
    }
  } catch (error) {
    console.warn('[Gemini] Failed to parse intent response:', error);
    return null;
  }
}

const isGeminiRateLimit = (error: unknown) => {
  const err = error as { status?: number; code?: number; message?: string } | null;
  if (err?.status === 429 || err?.code === 429) return true;
  const message = err?.message ?? (error instanceof Error ? error.message : '');
  return message.includes('429') || message.includes('RESOURCE_EXHAUSTED') || message.includes('quota');
};

const normalizeGeminiWord = (value: string | null | undefined) => {
  if (!value) return '';
  return value.replace(/[`"'\n\r]/g, '').trim();
};

const extractFirstKoreanWord = (value: string) => {
  const match = value.match(/[가-힣]{2,6}/);
  return match ? match[0] : '';
};

export async function getGeminiRpsChoice(): Promise<'가위' | '바위' | '보' | null> {
  const ctx = getBotContext();
  const apiKey = ctx.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: [
      {
        role: 'user',
        parts: [{ text: '가위바위보에서 너는 뭘 낼래? "가위", "바위", "보" 중 하나만 한 단어로 답해.' }]
      }
    ]
  });

  const raw = normalizeGeminiWord(response.text);
  if (raw.includes('가위')) return '가위';
  if (raw.includes('바위')) return '바위';
  if (raw.includes('보')) return '보';
  return null;
}

export async function getGeminiWordChainNext(params: { lastWord: string; used: string[] }): Promise<string | null> {
  const ctx = getBotContext();
  const apiKey = ctx.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const lastChar = Array.from(params.lastWord).pop() ?? '';
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              `끝말잇기야. 이전 단어: ${params.lastWord}. 마지막 글자: ${lastChar}. ` +
              `이미 나온 단어: ${params.used.join(', ') || '없음'}. ` +
              `위 조건을 만족하는 한국어 단어를 하나만 말해. 단어 외에는 아무것도 쓰지 마.`
          }
        ]
      }
    ]
  });

  const raw = normalizeGeminiWord(response.text);
  const word = extractFirstKoreanWord(raw);
  if (!word) return null;
  return word;
}
