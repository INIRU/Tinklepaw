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
import { registerMessageCreate } from './events/messageCreate.js';
import { startRoleSyncWorker } from './workers/roleSyncWorker.js';
import { startMusicControlWorker } from './workers/musicControlWorker.js';
import { startVoiceRewardWorker } from './workers/voiceRewardWorker.js';
import { initMusic } from './services/music.js';
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

client.once('ready', async () => {
  // eslint-disable-next-line no-console
  console.log(`Bot ready as ${client.user?.tag ?? 'unknown'}`);
  await primeChannelCache(client, env.NYARU_GUILD_ID);
});

registerInteractionCreate(client);
registerGuildMemberAdd(client);
registerMessageCreate(client);

client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.NYARU_GUILD_ID), {
    body: commandJson()
  });
});

client.once('ready', () => {
  startRoleSyncWorker(client);
  startMusicControlWorker();
  startVoiceRewardWorker(client);
});

await client.login(env.DISCORD_BOT_TOKEN);
