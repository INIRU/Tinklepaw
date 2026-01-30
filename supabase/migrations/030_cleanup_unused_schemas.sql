-- Cleanup unused schemas/tables left from templates.
--
-- IMPORTANT:
-- Do NOT drop Supabase-managed schemas like auth/storage/realtime/extensions/graphql/vault/cron.

-- An accidentally-created empty schema (capitalized) sometimes appears.
drop schema if exists "Nyang";

-- NOTE: public schema is commonly used by apps.
-- If you are 100% sure these tables are unused template leftovers, you can
-- uncomment them.
--
-- drop table if exists public.comments cascade;
-- drop table if exists public.posts cascade;
-- drop table if exists public.projects cascade;
-- drop table if exists public.skills cascade;
