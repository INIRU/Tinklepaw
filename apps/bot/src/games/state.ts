export type RpsChoice = 'rock' | 'paper' | 'scissors';

export type GameState =
  | {
      kind: 'rps';
      userId: string;
      startedAt: number;
    }
  | {
      kind: 'wordchain';
      userId: string;
      startedAt: number;
      lastWord: string;
    };

const gamesByChannel = new Map<string, GameState>();

export function getGame(channelId: string): GameState | null {
  return gamesByChannel.get(channelId) ?? null;
}

export function setGame(channelId: string, state: GameState) {
  gamesByChannel.set(channelId, state);
}

export function clearGame(channelId: string) {
  gamesByChannel.delete(channelId);
}
