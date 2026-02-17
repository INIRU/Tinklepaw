import { getAppConfig } from '../services/config.js';
import { runStockMarketMakerCycle } from '../services/stockMarketMaker.js';

const DEFAULT_DELAY_MS = 30_000;
const MIN_DELAY_MS = 30_000;

export function startStockMarketMakerWorker() {
  let isRunning = false;

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;

    let nextDelayMs = DEFAULT_DELAY_MS;
    try {
      await runStockMarketMakerCycle();
    } catch (error) {
      console.error('[StockMarketMakerWorker] tick failed:', error);
    } finally {
      try {
        const config = await getAppConfig();
        const configuredDelayMs = config.stock_market_maker_interval_ms ?? config.bot_sync_interval_ms ?? DEFAULT_DELAY_MS;
        nextDelayMs = Math.max(MIN_DELAY_MS, configuredDelayMs);
      } catch {
        nextDelayMs = DEFAULT_DELAY_MS;
      }

      isRunning = false;
      setTimeout(() => {
        void tick();
      }, nextDelayMs);
    }
  };

  void tick();
}
