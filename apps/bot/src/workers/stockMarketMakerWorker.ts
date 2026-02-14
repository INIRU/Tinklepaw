import { getAppConfig } from '../services/config.js';
import { runStockMarketMakerCycle } from '../services/stockMarketMaker.js';

const DEFAULT_DELAY_MS = 60_000;
const MIN_DELAY_MS = 30_000;

export function startStockMarketMakerWorker() {
  let isRunning = false;
  let consecutiveErrors = 0;

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;

    let nextDelayMs = DEFAULT_DELAY_MS;
    try {
      await runStockMarketMakerCycle();
      consecutiveErrors = 0;
    } catch (error) {
      consecutiveErrors += 1;
      console.error(`[StockMarketMakerWorker] tick failed (연속 ${consecutiveErrors}회):`, error);
    } finally {
      try {
        const config = await getAppConfig();
        // 마켓메이커 전용 간격 우선, 없으면 범용 간격 사용
        const configuredMs = config.stock_market_maker_interval_ms ?? config.bot_sync_interval_ms ?? DEFAULT_DELAY_MS;
        nextDelayMs = Math.max(MIN_DELAY_MS, configuredMs);
      } catch {
        nextDelayMs = DEFAULT_DELAY_MS;
      }

      // 연속 에러 시 백오프 (최대 5분)
      if (consecutiveErrors > 0) {
        nextDelayMs = Math.min(nextDelayMs * Math.pow(2, Math.min(consecutiveErrors, 3)), 300_000);
      }

      isRunning = false;
      setTimeout(() => {
        void tick();
      }, nextDelayMs);
    }
  };

  void tick();
}
