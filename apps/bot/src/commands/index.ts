import type { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v10';

import { drawCommand } from './draw.js';
import { dailyCommand } from './daily.js';
import { equipCommand } from './equip.js';
import { inventoryCommand } from './inventory.js';
import { unequipCommand } from './unequip.js';
import { helpCommand } from './help.js';
import { notificationCommand } from './notification.js';
import { notificationSendCommand } from './notification-send.js';
import { setupCommand } from './setup.js';
import type { SlashCommand } from './types.js';

export const commands: SlashCommand[] = [
  drawCommand, 
  dailyCommand,
  inventoryCommand, 
  equipCommand, 
  unequipCommand, 
  helpCommand,
  setupCommand,
  notificationCommand,
  notificationSendCommand
];

export function commandJson(): RESTPostAPIApplicationCommandsJSONBody[] {
  return commands.map((c) => c.json);
}
