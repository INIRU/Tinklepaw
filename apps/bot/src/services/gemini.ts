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

const lastCallByUser = new Map<string, number>();
const conversationHistory = new Map<string, Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>>();

export async function inferIntentFromGemini(params: { userId: string; text: string }): Promise<Intent | null> {
  const ctx = getBotContext();
  const apiKey = ctx.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const now = Date.now();
  const last = lastCallByUser.get(params.userId) ?? 0;
  if (now - last < 1500) return { action: 'chat', reply: '잠깐만. 너무 빨라.' };
  lastCallByUser.set(params.userId, now);

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
  const history = conversationHistory.get(params.userId) ?? [];
  
  if (history.length > 20) history.splice(0, history.length - 20);

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

Return JSON with the schema.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: [
      ...history,
      { role: 'user', parts: [{ text: params.text }] }
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      systemInstruction: { parts: [{ text: systemInstruction }] }
    }
  });

  const raw = response.text;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { 
      action: string; 
      itemName?: string; 
      reply?: string;
      query?: string;
    };
    
    if (parsed.action === 'chat' && parsed.reply) {
      history.push({ role: 'user', parts: [{ text: params.text }] });
      history.push({ role: 'model', parts: [{ text: parsed.reply }] });
      conversationHistory.set(params.userId, history);
    }

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
