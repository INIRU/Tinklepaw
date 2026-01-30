import Groq from 'groq-sdk';

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

// JSON Schema for structured output
const jsonSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
    enum: ['chat', 'draw', 'draw10', 'inventory', 'equip', 'unequip', 'game_rps', 'game_wordchain', 'points'],
    description: 'One of: chat, draw, draw10, inventory, equip, unequip, game_rps, game_wordchain, points'
  },
    itemName: {
      type: 'string',
      description: 'For equip action, exact item name'
    },
    reply: {
      type: 'string',
      description: 'For chat action, the assistant reply'
    }
  },
  required: ['action']
};

const lastCallByUser = new Map<string, number>();
const conversationHistory = new Map<string, Array<{ role: 'user' | 'assistant' | 'system'; content: string }>>();

export async function inferIntentFromGroq(params: { userId: string; text: string }): Promise<Intent | null> {
  const ctx = getBotContext();
  const apiKey = ctx.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn('GROQ_API_KEY is missing');
    return null;
  }

  const now = Date.now();
  const last = lastCallByUser.get(params.userId) ?? 0;
  if (now - last < 1000) return { action: 'chat', reply: '잠깐만. 너무 빨라.' };
  lastCallByUser.set(params.userId, now);

  let personaPrompt = `You are "쿠로", a Discord bot for the "방울냥" (Bangulnyang) server.
Your role:
- Manage gacha currency (points) and role items.
- Act like a solitary cat who prefers being alone but secretly cares.
- Tone: Cool, slightly aloof, tsundere, informal (banmal).
- Occasionally play mini-games (Rock-Paper-Scissors, Word Chain) if asked.`;

  try {
    const { data } = await ctx.supabase.from('app_config').select('persona_prompt').eq('id', 1).maybeSingle();
    type AppConfigRow = {
      persona_prompt?: string | null;
    };
    const config = data as AppConfigRow | null;
    if (config?.persona_prompt) {
      personaPrompt = config.persona_prompt;
    }
  } catch (error) {
    /* empty */
  }

  const groq = new Groq({ apiKey });
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

IMPORTANT: You MUST return a valid JSON object matching this schema:
${JSON.stringify(jsonSchema, null, 2)}`;

  try {
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      { role: 'system', content: systemInstruction },
      ...history,
      { role: 'user', content: params.text }
    ];

    const completion = await groq.chat.completions.create({
      messages,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 1024,
      response_format: { type: 'json_object' }
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { 
      action: string; 
      itemName?: string; 
      reply?: string;
    };
    
    if (parsed.action === 'chat' && parsed.reply) {
      history.push({ role: 'user', content: params.text });
      history.push({ role: 'assistant', content: parsed.reply });
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
    console.error('Groq API Error:', error);
    return null;
  }
}
