import type { Message } from 'discord.js';

import { clearGame, getGame, setGame } from './state.js';

const START_WORDS = ['사과', '바다', '고양이', '학교', '기차', '하늘', '친구', '노트', '라면', '연필'];
const WORDS = [
  '사과',
  '과자',
  '자전거',
  '거울',
  '울타리',
  '이불',
  '바다',
  '다람쥐',
  '하늘',
  '늘보',
  '고양이',
  '이야기',
  '기차',
  '차표',
  '표정',
  '정원',
  '원숭이',
  '친구',
  '구름',
  '름자',
  '노트',
  '트럭',
  '라면',
  '면도',
  '도서관'
];

function firstChar(s: string) {
  return Array.from(s)[0] ?? '';
}
function lastChar(s: string) {
  const arr = Array.from(s);
  return arr[arr.length - 1] ?? '';
}

function pickNext(start: string, used: Set<string>): string | null {
  const target = lastChar(start);
  const candidates = WORDS.filter((w) => firstChar(w) === target && !used.has(w));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}

const usedByChannel = new Map<string, Set<string>>();

export async function startWordChain(channelId: string, userId: string, reply: (text: string) => Promise<unknown>) {
  const start = START_WORDS[Math.floor(Math.random() * START_WORDS.length)]!;
  setGame(channelId, { kind: 'wordchain', userId, startedAt: Date.now(), lastWord: start });
  usedByChannel.set(channelId, new Set([start]));
  await reply(`끝말잇기 시작! 첫 단어: **${start}**\n(그만/종료로 종료)`);
}

export async function handleWordChainMessage(message: Message): Promise<boolean> {
  const state = getGame(message.channelId);
  if (!state || state.kind !== 'wordchain') return false;
  if (message.author.id !== state.userId) return true;

  const trimmed = message.content.trim();
  if (trimmed === '그만' || trimmed === '종료') {
    clearGame(message.channelId);
    usedByChannel.delete(message.channelId);
    await message.reply('끝말잇기 종료.');
    return true;
  }

  if (trimmed.length < 2) {
    await message.reply('단어를 보내줘.');
    return true;
  }

  const expected = lastChar(state.lastWord);
  if (firstChar(trimmed) !== expected) {
    await message.reply(`틀렸어. **${state.lastWord}** 의 마지막 글자는 **${expected}** 이야.`);
    return true;
  }

  const used = usedByChannel.get(message.channelId) ?? new Set<string>();
  if (used.has(trimmed)) {
    await message.reply('이미 나온 단어야. 다른 단어!');
    return true;
  }
  used.add(trimmed);
  usedByChannel.set(message.channelId, used);

  const next = pickNext(trimmed, used);
  if (!next) {
    clearGame(message.channelId);
    usedByChannel.delete(message.channelId);
    await message.reply('음... 더 이상 생각이 안난다. 네가 이겼어!');
    return true;
  }

  used.add(next);
  setGame(message.channelId, { ...state, lastWord: next });
  await message.reply(`좋아. **${next}**`);
  return true;
}
