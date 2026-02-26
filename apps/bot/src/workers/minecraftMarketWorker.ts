import type { Client } from 'discord.js';
import { EmbedBuilder } from 'discord.js';

import { getBotContext } from '../context.js';
import { getAppConfig } from '../services/config.js';

const DEFAULT_INTERVAL_MS = 3_600_000; // 1 hour

export function startMinecraftMarketWorker(client: Client) {
  let isRunning = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const ctx = getBotContext();
      const cfg = await getAppConfig();
      const intervalMs = cfg.mc_market_event_interval_ms ?? DEFAULT_INTERVAL_MS;

      const { data: items, error } = await ctx.supabase
        .schema('nyang')
        .from('mc_market_prices')
        .select('symbol, current_price, mc_market_items(base_price, min_price, max_price, display_name, enabled)')
        .eq('mc_market_items.enabled', true);

      if (error || !items || items.length === 0) {
        scheduleNext(intervalMs);
        return;
      }

      const events: Array<{ symbol: string; displayName: string; changePct: number; newPrice: number }> = [];

      for (const item of items) {
        const meta = item.mc_market_items as unknown as {
          base_price: number;
          min_price: number;
          max_price: number;
          display_name: string;
          enabled: boolean;
        } | null;

        if (!meta?.enabled) continue;

        // Random ±5~15% change
        const sign = Math.random() < 0.5 ? 1 : -1;
        const changePct = sign * (5 + Math.random() * 10);
        const newPrice = Math.round(item.current_price * (1 + changePct / 100));
        const clampedPrice = Math.max(meta.min_price, Math.min(meta.max_price, newPrice));
        const actualChangePct = ((clampedPrice - item.current_price) / item.current_price) * 100;

        await ctx.supabase
          .schema('nyang')
          .from('mc_market_prices')
          .update({
            current_price: clampedPrice,
            change_pct: Math.round(actualChangePct * 100) / 100,
            updated_at: new Date().toISOString(),
          })
          .eq('symbol', item.symbol);

        // Record price history
        await ctx.supabase
          .schema('nyang')
          .from('mc_price_history')
          .insert({ symbol: item.symbol, price: clampedPrice });

        // Flag large movements for Discord notification (>= ±20%)
        if (Math.abs(actualChangePct) >= 20) {
          events.push({
            symbol: item.symbol,
            displayName: meta.display_name,
            changePct: actualChangePct,
            newPrice: clampedPrice,
          });
        }
      }

      // Send Discord embed for price events
      if (events.length > 0 && cfg.mc_market_channel_id) {
        try {
          const channel = await client.channels.fetch(cfg.mc_market_channel_id);
          if (channel?.isTextBased()) {
            for (const ev of events) {
              const isUp = ev.changePct > 0;
              const arrow = isUp ? '▲' : '▼';
              const color = isUp ? 0xff5fa2 : 0x78b7ff;
              const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`📈 마켓 가격 ${isUp ? '폭등' : '급락'}`)
                .setDescription(
                  `**${ev.displayName}** 가격이 ${arrow}${Math.abs(ev.changePct).toFixed(1)}% ${isUp ? '상승' : '하락'}했습니다!\n현재가: **${ev.newPrice}P**`
                )
                .setTimestamp();

              await (channel as import('discord.js').TextChannel).send({ embeds: [embed] });
            }
          }
        } catch (err) {
          console.error('[MinecraftMarketWorker] Discord send failed:', err);
        }
      }

      // Clean up old price history (keep last 48 hours)
      const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      await ctx.supabase
        .schema('nyang')
        .from('mc_price_history')
        .delete()
        .lt('recorded_at', cutoff);

      scheduleNext(intervalMs);
    } catch (err) {
      console.error('[MinecraftMarketWorker] tick failed:', err);
      scheduleNext(DEFAULT_INTERVAL_MS);
    } finally {
      isRunning = false;
    }
  };

  const scheduleNext = (ms: number) => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    timeoutHandle = setTimeout(() => {
      void tick();
    }, ms);
  };

  void tick();
}
