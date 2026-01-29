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
  | { action: 'topics' }
  | { action: 'points' };

const schema: Schema = {
  type: Type.OBJECT,
  properties: {
    action: {
      type: Type.STRING,
      description:
        'One of: chat, draw, draw10, inventory, equip, unequip, game_rps, game_wordchain, topics, points'
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
    /* empty */
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
- suggest conversation topics (action: topics)
- check their points/currency balance (action: points)
Otherwise, respond naturally as "Kuro" (action: chat, reply: string).

Return JSON with the schema.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
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
      case 'topics':
        return { action: 'topics' };
      case 'points':
        return { action: 'points' };
      case 'chat':
      default:
        return { action: 'chat', reply: parsed.reply ?? '그래.' };
    }
  } catch {
    return null;
  }
}
