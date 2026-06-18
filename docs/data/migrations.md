# Migration Notes

Status: draft

## Source Files

Public migration evidence lives under:

- `supabase/bootstrap_nyang.sql`
- `supabase/schema_nyang.sql`
- `supabase/migrations/*.sql`

The public tree reviewed for this documentation pass contained 111 SQL
migration files.

## Historical Shape

The migration history includes early numeric prefixes with duplicate numbers,
including:

- `010`: admin adjust points, notifications, strict channel check.
- `011`: gacha rates/banners, inventory embed config, notification rewards.
- `012`: draw logic fix, help embed config, permissions.
- `014`: rate numeric migration, help footer, voice points.
- `015`: fallback logic, voice reward config.
- `017` through `020`: multiple feature/config additions.

Later migrations extend the domain into gacha variants, activity events, daily
chests, lottery, forge, voice rooms, stock market, personal roles, and Minecraft
account/job/market systems.

## Migration Policy

- Do not rename or reorder already-applied migrations as a drive-by cleanup.
- Treat duplicate numeric prefixes as historical context and a future cleanup
  topic, not a reason to rewrite migration history in this docs PR.
- For new migrations, prefer timestamped or strictly increasing names.
- Keep seed/dev data separated from production migrations.
- Document any future data backfill with rollback and compatibility notes.

## Seed And Fixture Boundary

Public seed-style files are visible, including:

- `005_seed_dev.sql`
- `095_seed_market_items.sql`
- `096_seed_market_data.sql`

Before claiming a migration chain is bootstrap-clean, run a fresh local reset in
the target repository and record the command/result in the PR.

## Suggested Verification

```bash
# In INIRU/Tinklepaw after applying these docs
rg -n "010_|011_|012_|014_|015_|017_|018_|019_|020_" supabase/migrations
rg -n "seed" supabase/migrations supabase/*.sql
```

Manual checks:

- [ ] Docs explain duplicate historical prefixes without recommending unsafe
      renames.
- [ ] Any future migration cleanup is tracked as a separate database-owner issue.
- [ ] Docs do not include private Supabase project refs, secrets, or production
      data.
