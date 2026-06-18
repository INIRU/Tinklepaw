# Data Security And Access Boundary

Status: draft

## Public-Source Evidence

The public SQL evidence shows some explicit policy/RLS signals:

- `supabase/bootstrap_nyang.sql` includes policy names for public reads and
  service-role access, including public read policies for catalog/config-style
  tables and service-role access for user/balance/inventory-style tables.
- `supabase/migrations/065_admin_analytics_snapshots.sql` creates service-role
  policy evidence for `nyang.admin_analytics_snapshots`.

This docs pass does not connect to the live Supabase project. It should not be
read as a complete production security audit.

## Public Data

Public or semi-public read access should be limited to intentionally public
catalog/config surfaces, such as:

- item catalog;
- gacha pool catalog;
- non-sensitive app configuration intended for clients;
- other readonly presentation data explicitly approved by maintainers.

## Backend-Owned Or Service-Owned Data

The following data should be treated as backend/server-owned unless target repo
maintainers prove a narrower client-safe policy:

- point balances and point ledger writes;
- inventory and equipped state;
- role sync jobs;
- admin analytics snapshots;
- Minecraft link requests;
- Minecraft player/job/market state;
- stock wallet, holdings, fee, and event data;
- bot/music/voice runtime control jobs;
- privileged configuration writes.

## Secrets Boundary

Service-role credentials and provider tokens must stay server-side only.

Never expose these classes of values in browser bundles, public docs,
screenshots, logs, or examples:

- Supabase service-role key;
- Discord bot token;
- provider API keys;
- database URLs;
- private project refs when they are sensitive;
- real production user/server/channel identifiers.

## Identifier Privacy

Discord user IDs, Minecraft UUIDs, guild/channel IDs, and operational payloads
should be treated as private or pseudonymous identifiers. Public docs should use
schema names and synthetic examples only.

## Unknowns

The public source reviewed here is not enough to claim:

- full RLS coverage for every table;
- production dashboard configuration;
- complete least-privilege service separation;
- alerting or incident response readiness.

Document unverified behavior as unknown instead of marking it safe.

## Suggested Review

```bash
# In INIRU/Tinklepaw after applying these docs
rg -n "SUPABASE_SERVICE_ROLE_KEY|DISCORD_TOKEN|postgres://|GROQ|GEMINI" docs/data docs/adr README.md
rg -n "create policy|alter table .* enable row level security" supabase
```

Manual checks:

- [ ] Public docs include no real secrets, private IDs, or production data.
- [ ] Security claims identify which evidence came from public SQL.
- [ ] Unverified RLS behavior remains labeled as unknown.
- [ ] Future RLS fixes are separate code/database PRs, not hidden in a docs PR.
