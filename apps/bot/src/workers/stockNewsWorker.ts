import type { Client } from 'discord.js';

import { getAppConfig } from '../services/config.js';
import { runStockNewsCycle } from '../services/stockNews.js';

const MIN_DELAY_MS = 5_000;

export function startStockNewsWorker(client: Client) {
  let isRunning = false;

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;

    let nextDelayMs = MIN_DELAY_MS;
    try {
      await runStockNewsCycle(client);
    } catch (error) {
      console.error('[StockNewsWorker] tick failed:', error);
    } finally {
      try {
        const config = await getAppConfig();
        nextDelayMs = Math.max(MIN_DELAY_MS, config.bot_sync_interval_ms || MIN_DELAY_MS);
      } catch {
        nextDelayMs = MIN_DELAY_MS;
      }

      isRunning = false;
      setTimeout(() => {
        void tick();
      }, nextDelayMs);
    }
  };

  void tick();
}
