-- Supabase hardening — run AFTER `npm run db:deploy`, and again after any
-- migration that adds a table. Safe to re-run: every statement is idempotent.
--
-- Defence in depth. The `app` schema is already outside Supabase's exposed
-- schemas, so PostgREST cannot reach these tables at all. This file adds a
-- second layer that still holds if someone later adds `app` to the exposed
-- schema list in the dashboard.
--
-- Row Level Security with NO policies means deny-all for ordinary roles. The
-- role Prisma connects as (`postgres`) has BYPASSRLS, so the application is
-- unaffected — verify that with the query at the bottom before trusting this.

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'app'
  LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', target.tablename);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', target.tablename);
    EXECUTE format('REVOKE ALL ON app.%I FROM anon, authenticated', target.tablename);
  END LOOP;
END
$$;

-- Re-assert the lockout for anything created since the init script ran.
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM anon, authenticated;

-- --- Verification ------------------------------------------------------------
-- 1. Every table has RLS on:
--      SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'app';
--
-- 2. The API roles hold no grants (expect zero rows):
--      SELECT grantee, table_name, privilege_type
--      FROM information_schema.role_table_grants
--      WHERE table_schema = 'app' AND grantee IN ('anon', 'authenticated');
--
-- 3. The connecting role bypasses RLS, so FORCE above cannot lock the app out:
--      SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user;
--
--    If rolbypassrls is false, do NOT use FORCE ROW LEVEL SECURITY — remove that
--    line, re-run, and rely on the schema isolation plus REVOKE instead.
