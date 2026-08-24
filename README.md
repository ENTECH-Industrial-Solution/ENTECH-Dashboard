# ENTECH Dashboard

ระบบติดตามงานพนักงาน — Employee task tracking with centralised admin control.

- ผู้ดูแลระบบสร้างและระงับบัญชีพนักงานได้ทั้งหมด (admins provision and revoke employee accounts)
- หน้าหลักแบ่งงานเป็น 2 หมวด: **งานที่กำลังดำเนินการ** และ **ประวัติงานที่เสร็จแล้ว** (เก็บเป็นหลักฐาน แก้ไขไม่ได้)
- รองรับภาษาไทยและอังกฤษ สลับได้ทันที
- บันทึกการใช้งานแบบ append-only ลบหรือแก้ไขไม่ได้

**Stack:** Next.js 15 (App Router) · TypeScript · Prisma · PostgreSQL · Tailwind v4 · Vercel

---

## Setup

Requires Node 20.11+ and a Supabase project (any PostgreSQL 14+ works, but the
setup below is Supabase-specific).

### 1. Prepare the database

In the Supabase dashboard, open **SQL Editor** and run
[`prisma/supabase-01-init.sql`](prisma/supabase-01-init.sql).

This creates a dedicated `app` schema and locks the `anon` and `authenticated`
roles out of it. It matters: Supabase exposes the `public` schema over its REST
API using the anon key, and grants those roles access to tables created there by
default. Left alone, `Employee.passwordHash` and `Session.tokenHash` would be
readable by anyone holding a key that is designed to ship in browser code. This
app never uses Supabase Auth or PostgREST, so its tables belong outside `public`.

### 2. Configure the app

```bash
npm install
cp .env.example .env
```

Use `.env`, not `.env.local`: the Prisma CLI reads only `.env`, while Next.js
reads both. One file keeps them from drifting apart. It is gitignored.

Both connection strings come from **Project Settings → Database → Connection
string**, and both need `?schema=app`:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Transaction pooler, port **6543**, with `?pgbouncer=true&connection_limit=1&schema=app` |
| `DIRECT_URL` | Session pooler, port **5432**, with `?schema=app` — migrations need session-level features a transaction pooler cannot carry |
| `SESSION_SECRET` | 32+ random characters — `openssl rand -base64 48` |
| `APP_URL` | Must match the deployed origin exactly in production |
| `SEED_ADMIN_*` | Bootstrap admin only; remove after the first seed, never set in Vercel |

A password containing `@ : / ? # &` must be percent-encoded in the URL
(`@` becomes `%40`), otherwise the connection string parses wrongly.

Use the **session pooler** for `DIRECT_URL`, not the direct
`db.[ref].supabase.co` host: Supabase's direct connection is IPv6-only unless
the project has the IPv4 add-on, and most office networks cannot reach it.

### 3. Migrate, harden, seed

```bash
npm run db:migrate
```

Then run [`prisma/supabase-02-harden.sql`](prisma/supabase-02-harden.sql) in the
SQL Editor — it enables deny-all RLS on the newly created tables as a second
layer. **Re-run it after any migration that adds a table.** It is idempotent.

```bash
npm run db:seed
npm run dev
```

Sign in at http://localhost:3000/login with the seeded `SEED_ADMIN_CODE`. The
seeded account is forced to change its password on first sign-in.

## Deploying to Vercel

1. Import the repository in Vercel.
2. Set `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, and `APP_URL` as
   Production environment variables. Do **not** set `SEED_ADMIN_*` there.
3. Deploy. `npm run build` runs `prisma generate` automatically.
4. Apply migrations against production once, from your machine:
   ```bash
   npm run db:deploy
   ```
5. Re-run `prisma/supabase-02-harden.sql`, then seed the first admin and unset
   the seed variables.

Vercel and Supabase both default to `us-east-1`. Put the Vercel function region
in the same region as the Supabase project, or every query pays a round trip
across the Atlantic or Pacific.

`@node-rs/argon2` ships prebuilt binaries and is declared in
`serverExternalPackages`, so it runs on Vercel's Node runtime without a build step.

## Security model

| Concern | Approach |
| --- | --- |
| Passwords | Argon2id (19 MiB, t=2, p=1); admins never choose or see stored passwords |
| Sessions | Opaque 32-byte token, httpOnly cookie, only SHA-256 stored, 12 h absolute + 1 h idle expiry |
| Revocation | All sessions killed on password change, role change, and deactivation |
| Brute force | Per-account exponential lockout in the database, plus a per-IP limiter |
| Enumeration | Identical error and comparable response timing for unknown code vs wrong password |
| Authorization | Enforced server-side in every page and action; middleware is only a cheap pre-filter |
| Input | Zod schemas at every action boundary |
| Evidence | Completed tasks immutable; `TaskEvent` and `AuditLog` append-only; reopening requires an admin and a reason |
| Headers | Strict CSP, HSTS, `frame-ancestors 'none'`, `nosniff`, restrictive Permissions-Policy |
| Data retention | Employees are deactivated, never deleted, so task history survives |
| Database exposure | Tables live in a non-exposed `app` schema, unreachable by Supabase's anon key, with deny-all RLS on top |

Known limitation: the per-IP rate limiter is in-memory and therefore per-instance
on serverless. The database-backed per-account lockout is the authoritative
control. See `src/lib/rate-limit.ts` for how to move it to Redis.

## Project layout

```
prisma/schema.prisma      data model + the invariants the code relies on
src/middleware.ts         cheap cookie pre-filter (NOT the security boundary)
src/lib/auth/             password hashing, sessions, RBAC, login throttling
src/lib/validation.ts     every Zod schema
src/server/actions/       all mutations (server actions)
src/server/queries.ts     all reads, scoped by the caller
src/app/(app)/            authenticated routes
src/app/(app)/admin/      admin-only routes
```

See [CLAUDE.md](CLAUDE.md) for the architectural detail behind these choices.
