# Schema Catalog

Status: draft

## Overview

Tinklepaw's public SQL shows two schema layers:

- Legacy `public.*` tables from early migrations.
- The richer `nyang.*` schema used as the main documentation surface.

Use `nyang.*` for the public architecture narrative unless maintainers confirm a
legacy `public.*` table is still part of an active runtime path.

## Core Identity, Points, And Configuration

| Entity | Purpose | Source |
|---|---|---|
| `nyang.users` | Discord user identity and profile metadata. | `schema_nyang.sql` |
| `nyang.point_balances` | Current point balance and progression counters such as daily chest streak and forge energy. | `schema_nyang.sql` |
| `nyang.point_events` | Append-style point ledger with idempotency key and metadata. | `schema_nyang.sql` |
| `nyang.app_config` | Single-row operational configuration for bot, reward, gacha, music, stock, maintenance, and Minecraft market behavior. | `schema_nyang.sql`, config migrations |
| `nyang.reward_channels` | Discord channel allowlist/configuration for reward behavior. | `schema_nyang.sql` |
| `nyang.role_sync_jobs` | Async Discord role sync work queue, retries, and error state. | `schema_nyang.sql` |

## Gacha, Inventory, Roles, And Rewards

| Entity | Purpose | Source |
|---|---|---|
| `nyang.items` | Gacha/item catalog with rarity, role, activity, refund, reward, and metadata fields. | `schema_nyang.sql` |
| `nyang.gacha_pools` | Draw pools, cost/cooldown/rate/pity settings, and limited/permanent pool metadata. | `schema_nyang.sql` |
| `nyang.gacha_pool_items` | Weighted item membership for pools. | `schema_nyang.sql` |
| `nyang.gacha_user_state` | Per-user/per-pool pity, cooldown, and total-pull state. | `schema_nyang.sql` |
| `nyang.gacha_pulls` | Draw event header with user, pool, free/paid, spent points, and timestamp. | `schema_nyang.sql` |
| `nyang.gacha_pull_results` | Items awarded by each pull, including pity/variant evidence fields. | `schema_nyang.sql` |
| `nyang.inventory` | User-owned item quantities. | `schema_nyang.sql` |
| `nyang.equipped` | User's currently equipped item/role state. | `schema_nyang.sql` |
| `nyang.personal_roles` | Personal Discord role grant/customization state. | `080_personal_roles.sql` |

## Discord Runtime, Music, Voice, Notifications, And Errors

| Entity | Purpose | Source |
|---|---|---|
| `nyang.notifications` | Notification/reward delivery state. | `010_notifications.sql` |
| `nyang.music_control_jobs` | Music action work queue with status and payload. | `027_music_control_jobs.sql`, `schema_nyang.sql` |
| `nyang.music_control_logs` | Music command/action audit log. | `027_music_control_jobs.sql`, `schema_nyang.sql` |
| `nyang.music_state` | Per-guild queue/current-track/runtime state. | `028_music_state.sql`, `schema_nyang.sql` |
| `nyang.voice_auto_rooms` | Auto-created voice room ownership and category state. | `050_voice_interface_auto_room_settings.sql`, `052_voice_auto_rooms_owner_uniqueness.sql` |
| `nyang.voice_room_templates` | Per-user default voice room settings. | `050_voice_interface_auto_room_settings.sql` |
| `nyang.error_logs` | Bot/application error logging surface. | `022_error_logging_config.sql` |

## Economy, Activity, Stock, And Analytics

| Entity | Purpose | Source |
|---|---|---|
| `nyang.activity_events` | Normalized activity event log by guild, user, event type, value, and metadata. | `036_activity_events.sql` |
| `nyang.sword_forge_state` | Per-user sword forge progression, attempts, sales, and paid cost. | `044_sword_forge_feature.sql` |
| `nyang.stock_market` | Stock market configuration/current price surface. | `058_stock_market_feature.sql` |
| `nyang.stock_candles` | OHLCV candle history for dashboard charts. | `058_stock_market_feature.sql` |
| `nyang.stock_holdings` | Per-user stock holdings and average price. | `058_stock_market_feature.sql` |
| `nyang.stock_news_events` | News/sentiment events and price impact metadata. | `061_stock_news_feature.sql` |
| `nyang.stock_market_maker_runs` | Automated market-maker run history. | `063_stock_market_maker.sql` |
| `nyang.stock_market_maker_events` | Actor-level market-maker event history. | `068_stock_market_maker_personas_and_high_frequency.sql` |
| `nyang.stock_nyang_balances` | Per-user stock currency wallet. | `071_stock_nyang_wallet_exchange.sql` |
| `nyang.stock_nyang_events` | Stock currency wallet ledger. | `071_stock_nyang_wallet_exchange.sql` |
| `nyang.stock_holding_fee_events` | Holding-fee charge/audit events. | `076_stock_holding_fee_and_rpc_type_fix.sql` |
| `nyang.admin_analytics_snapshots` | Cached admin analytics payloads by range/filter/generation time. | `065_admin_analytics_snapshots.sql` |

## Minecraft Integration And Market

| Entity | Purpose | Source |
|---|---|---|
| `nyang.minecraft_players` | Discord-to-Minecraft account link. | `084_minecraft_players.sql` |
| `nyang.minecraft_link_requests` | Temporary OTP/link flow between Discord and Minecraft. | `084_minecraft_players.sql`, `091_minecraft_link_requests_add_uuid.sql`, `092_minecraft_link_uuid_pk.sql` |
| `nyang.minecraft_jobs` | Minecraft job type, level, XP, and job-change state. | `085_minecraft_jobs.sql` |
| `nyang.mc_market_items` | Minecraft market item catalog. | `086_market_items.sql` |
| `nyang.mc_market_prices` | Current market price state. | `086_market_items.sql` |
| `nyang.mc_price_history` | Historical market price records. | `086_market_items.sql` |
| `nyang.mc_market_trades` | Market trade history. | `087_market_trades.sql` |
| `nyang.mc_daily_quests` | Player daily quest progress. | `088_daily_quests.sql` |
| `nyang.mc_quest_templates` | Quest definitions/templates. | `088_daily_quests.sql` |
| `nyang.mc_p2p_listings` | Player-to-player listing state. | `089_p2p_listings.sql` |
| `nyang.mc_player_skills` | Minecraft skill progression. | `093_player_skills.sql` |

## Review Notes

- This catalog is based on public SQL parsing. Future schema-changing PRs should
  check it against the target repository's SQL and update it when entities,
  ownership, or runtime status change.
- Entity descriptions intentionally avoid private server IDs, project refs,
  secrets, and production data.
- Tables with unclear runtime use should be marked as historical or verified in
  a follow-up PR instead of over-claiming behavior.
