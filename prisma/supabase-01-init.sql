-- Supabase bootstrap — run ONCE in the SQL Editor BEFORE the first migration.
--
-- Why this file exists
-- -------------------
-- Supabase exposes the `public` schema over PostgREST using the `anon` key, and
-- its default privileges grant `anon` and `authenticated` access to tables the
-- `postgres` role creates there. Prisma creates tables as `postgres`, so a
-- default setup would publish Employee.passwordHash and Session.tokenHash to
-- anyone holding the anon key — a key that is meant to ship in browser code.
--
-- This app does not use Supabase Auth, PostgREST, or the anon key at all. It
-- talks to Postgres directly through Prisma. So the tables belong in a schema
-- that Supabase never exposes.
--
-- After running this, set `?schema=app` on DATABASE_URL and DIRECT_URL.

CREATE SCHEMA IF NOT EXISTS app;

-- Only the owner role Prisma connects as may touch this schema. The API roles
-- are explicitly locked out rather than merely un-granted.
REVOKE ALL ON SCHEMA app FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- Verify: this must return no rows for anon/authenticated.
--   SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'app' AND grantee IN ('anon', 'authenticated');
