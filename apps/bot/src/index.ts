import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env.local') });

import { Client, GatewayIntentBits, Partials, REST, Routes } from 'discord.js';

import { commandJson } from './commands/index.js';
import { setBotContext } from './context.js';
import { assertEnv } from './lib/env.js';
import { createSupabaseAdminClient } from './lib/supabase.js';
import { registerInteractionCreate } from './events/interactionCreate.js';
import { registerGuildMemberAdd } from './events/guildMemberAdd.js';
import { registerGuildMemberRemove } from './events/guildMemberRemove.js';
import { registerMessageCreate } from './events/messageCreate.js';
import { registerVoiceStateUpdate } from './events/voiceStateUpdate.js';
import { startRoleSyncWorker } from './workers/roleSyncWorker.js';
import { startMusicControlWorker } from './workers/musicControlWorker.js';
import { startVoiceRewardWorker } from './workers/voiceRewardWorker.js';
import { startStockNewsWorker } from './workers/stockNewsWorker.js';
import { startStockMarketMakerWorker } from './workers/stockMarketMakerWorker.js';
import { initMusic, restoreMusicSession } from './services/music.js';
import { primeChannelCache } from './services/channelCache.js';

const env = assertEnv(process.env);

const supabase = createSupabaseAdminClient(env);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

setBotContext({ env, supabase });

initMusic(client, env);

// 이벤트 핸들러 등록 (들여쓰기 통일)
registerInteractionCreate(client);
registerGuildMemberAdd(client);
registerGuildMemberRemove(client);
registerMessageCreate(client);
registerVoiceStateUpdate(client);

// ready 핸들러 통합 (기존 3개 → 1개로 병합)
client.once('ready', async () => {
  console.log(`Bot ready as ${client.user?.tag ?? 'unknown'}`);

  // 1) 슬래시 커맨드 등록
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.NYARU_GUILD_ID), {
    body: commandJson()
  });

  // 2) 채널 캐시 초기화 + 음악 세션 복원
  await primeChannelCache(client, env.NYARU_GUILD_ID);
  await restoreMusicSession(client).catch((error) => {
    console.warn('[Music] session restore failed', error);
  });

  // 3) 백그라운드 워커 시작
  startRoleSyncWorker(client);
  startMusicControlWorker();
  startVoiceRewardWorker(client);
  startStockNewsWorker(client);
  startStockMarketMakerWorker();
});

await client.login(env.DISCORD_BOT_TOKEN);
