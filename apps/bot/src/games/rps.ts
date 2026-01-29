import type { Message } from 'discord.js';

import { clearGame, getGame } from './state.js';

const KOREAN: Record<string, 'rock' | 'paper' | 'scissors'> = {
  바위: 'rock',
  보: 'paper',
  가위: 'scissors'
};

function pickBotChoice(): 'rock' | 'paper' | 'scissors' {
  const all: Array<'rock' | 'paper' | 'scissors'> = ['rock', 'paper', 'scissors'];
  return all[Math.floor(Math.random() * all.length)]!;
}

function result(user: 'rock' | 'paper' | 'scissors', bot: 'rock' | 'paper' | 'scissors') {
  if (user === bot) return 'draw';
  if (
    (user === 'rock' && bot === 'scissors') ||
    (user === 'scissors' && bot === 'paper') ||
    (user === 'paper' && bot === 'rock')
  )
    return 'win';
  return 'lose';
}

function toKorean(choice: 'rock' | 'paper' | 'scissors') {
  if (choice === 'rock') return '바위';
  if (choice === 'paper') return '보';
  return '가위';
}

export async function handleRpsMessage(message: Message): Promise<boolean> {
  const state = getGame(message.channelId);
  if (!state || state.kind !== 'rps') return false;
  if (message.author.id !== state.userId) return true;

  const trimmed = message.content.trim();
  if (trimmed === '그만' || trimmed === '종료') {
    clearGame(message.channelId);
    await message.reply('가위바위보 종료.');
    return true;
  }

  const userChoice = KOREAN[trimmed];
  if (!userChoice) {
    await message.reply('가위/바위/보 중에서 골라줘. (그만/종료로 종료)');
    return true;
  }

  const botChoice = pickBotChoice();
  const r = result(userChoice, botChoice);
  clearGame(message.channelId);

  const verdict = r === 'win' ? '내가 졌다…' : r === 'lose' ? '내가 이겼다.' : '비겼네.';
  await message.reply(`너: ${toKorean(userChoice)} / 나: ${toKorean(botChoice)}\n${verdict}`);
  return true;
}
