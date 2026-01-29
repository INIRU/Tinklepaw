# Nyaru

Discord bot + Next.js admin/user web, backed by Supabase.

## Prereqs
- Node.js + npm
- A Supabase project
- A Discord application (OAuth) + bot token

## Setup
1. Copy `.env.example` to `.env` and fill values.
2. Apply DB migrations in order:
   - `supabase/migrations/001_init.sql`
   - `supabase/migrations/002_rpc.sql`
   - `supabase/migrations/003_equip.sql`
   - `supabase/migrations/004_rewards.sql`
   - `supabase/migrations/006_join_message.sql`
   - `supabase/migrations/007_server_intro.sql`
   - `supabase/migrations/008_site_images.sql`
   - `supabase/migrations/009_nyang_schema.sql`
   - `supabase/migrations/005_seed_dev.sql` (optional, for local/dev testing)

### One-shot bootstrap (recommended after a full wipe)

If you dropped all tables/functions and want to recreate everything in a single step, run:

- `supabase/bootstrap_nyang.sql`

Alternative (authoritative schema DDL):

- `supabase/schema_nyang.sql`

Then reload PostgREST schema cache:

```sql
NOTIFY pgrst, 'reload schema';
```

Notes:
- `005_seed_dev.sql` creates placeholder items/pool; you should replace them with real Discord role mappings in `items.discord_role_id`.
- Activity rewards require `app_config` row with `id=1` and `reward_channels` whitelist entries.

## Dev
- Web: `npm run dev:web`
- Bot: `npm run dev:bot`
- Both: `npm run dev`

## OAuth Redirect URL
Discord Developer Portal > OAuth2 > Redirects:
- `http://localhost:3000/api/auth/callback/discord`

## NextAuth env (v5)
Use `AUTH_URL`, `AUTH_SECRET`, and for local/proxy setups: `AUTH_TRUST_HOST=true`.
