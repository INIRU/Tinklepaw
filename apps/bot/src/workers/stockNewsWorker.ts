import type { Client } from 'discord.js';

import { getAppConfig } from '../services/config.js';
import { runStockNewsCycle } from '../services/stockNews.js';

const DEFAULT_DELAY_MS = 10_000;
const MIN_DELAY_MS = 5_000;

export function startStockNewsWorker(client: Client) {
  let isRunning = false;
  let consecutiveErrors = 0;

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;

    let nextDelayMs = DEFAULT_DELAY_MS;
    try {
      await runStockNewsCycle(client);
      consecutiveErrors = 0;
    } catch (error) {
      consecutiveErrors += 1;
      console.error(`[StockNewsWorker] tick failed (연속 ${consecutiveErrors}회):`, error);
    } finally {
      try {
        const config = await getAppConfig();
        // 뉴스 워커 전용 간격 우선, 없으면 범용 간격 사용
        const configuredMs = config.stock_news_worker_interval_ms ?? config.bot_sync_interval_ms ?? DEFAULT_DELAY_MS;
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
