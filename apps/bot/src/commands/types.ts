import type { ChatInputCommandInteraction } from 'discord.js';
import type { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v10';

export type SlashCommand = {
  name: string;
  json: RESTPostAPIApplicationCommandsJSONBody;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};
