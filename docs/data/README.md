# Tinklepaw Data Architecture

Status: draft

## Purpose

This folder documents the public Supabase data model used by Tinklepaw across
the web dashboard, Discord bot, launcher, Minecraft integration, stock/economy
features, gacha/inventory, and operational tooling.

The goal is to make the database design reviewable without forcing a teammate
to read every SQL migration first.

## Source Of Truth

Current source files:

- `supabase/schema_nyang.sql`
- `supabase/bootstrap_nyang.sql`
- `supabase/migrations/*.sql`

Documentation files:

- `docs/data/schema.md`: entity catalog grouped by domain.
- `docs/data/erd.md`: Mermaid ERD for the main relationship path.
- `docs/data/migrations.md`: migration history, duplicate-prefix caveat, and
  future migration rules.
- `docs/data/security.md`: public-source RLS/security stance and secrets
  boundary.
- `docs/data/observability.md`: logs, events, analytics snapshots, and runtime
  state surfaces.
- `docs/adr/2026-06-18-supabase-shared-data-contract.md`: decision record for
  Supabase as the shared data contract across Tinklepaw surfaces.

## Scope

Included:

- `nyang.*` schema explanation from public SQL evidence.
- Legacy `public.*` tables as migration history context.
- High-level relationships for user identity, point ledger, gacha, inventory,
  stock/economy, and Minecraft integration.
- Migration caveats and security boundaries visible from public source.

Excluded:

- Production Supabase dashboard settings.
- Private project refs, service-role keys, tokens, Discord server IDs, or real
  production data.
- Changes to migrations, RLS policies, generated types, or runtime code.

## Review Checklist

- [ ] Each documented entity maps to public SQL evidence.
- [ ] The ERD renders in GitHub Markdown.
- [ ] Security notes separate verified public evidence from unknown private
      project settings.
- [ ] Migration notes do not tell contributors to rename already-applied
      migrations.
- [ ] No private working notes, internal ledgers, or raw process logs are
      copied into this repo.
