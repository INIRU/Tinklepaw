# Observability And Data Quality

Status: draft

## Public Observability Surfaces

The public schema contains several useful event/log/state surfaces:

| Entity | Purpose |
|---|---|
| `nyang.activity_events` | Broad activity ledger for user/guild event tracking. |
| `nyang.error_logs` | Bot/application error capture. |
| `nyang.admin_analytics_snapshots` | Cached admin analytics payloads by range/filter/generation time. |
| `nyang.music_control_logs` | Music command/action audit log. |
| `nyang.music_state` | Current music queue/runtime state. |
| `nyang.stock_news_events` | Stock economy news/sentiment event history. |
| `nyang.stock_market_maker_events` | Actor-level market-maker event history. |
| `nyang.stock_holding_fee_events` | Holding-fee charge/audit history. |
| `nyang.role_sync_jobs` | Retry and error state for role sync side effects. |

## Review Value

These tables help reviewers understand:

- what events can be replayed or audited;
- where runtime failures are stored;
- which background side effects have retry/error state;
- how economy/stock changes can be explained after the fact;
- which dashboard metrics are cached instead of recomputed on every request.

## Current Gaps From Public Evidence

This docs pass did not find public proof for:

- alert thresholds;
- retention windows;
- dashboard ownership;
- incident response playbooks;
- data quality checks;
- production log redaction policy.

Keep those as follow-ups unless maintainers can promote private evidence into
public docs.

## Suggested Follow-Ups

- Add retention expectations for `activity_events`, `error_logs`, and analytics
  snapshots.
- Document how failed `role_sync_jobs` are retried or triaged.
- Document which admin dashboard cards depend on
  `admin_analytics_snapshots`.
- Add a small incident checklist for bot/database data anomalies.

## Suggested Verification

```bash
# In INIRU/Tinklepaw after applying these docs
rg -n "activity_events|error_logs|admin_analytics_snapshots|role_sync_jobs" supabase docs/data
```

Manual checks:

- [ ] Observability docs do not claim alerting or retention that is not proven.
- [ ] Runtime logs or examples use synthetic data only.
- [ ] Follow-ups are separated from the first docs PR.
