import { getAppConfig } from '../services/config.js';
import { runStockMarketMakerCycle } from '../services/stockMarketMaker.js';

const MIN_DELAY_MS = 30_000;

export function startStockMarketMakerWorker() {
  let isRunning = false;

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;

    let nextDelayMs = 60_000;
    try {
      await runStockMarketMakerCycle();
    } catch (error) {
      console.error('[StockMarketMakerWorker] tick failed:', error);
    } finally {
      try {
        const config = await getAppConfig();
        nextDelayMs = Math.max(60_000, config.bot_sync_interval_ms || MIN_DELAY_MS);
      } catch {
        nextDelayMs = 60_000;
      }

      isRunning = false;
      setTimeout(() => {
        void tick();
      }, nextDelayMs);
    }
  };

  void tick();
}
