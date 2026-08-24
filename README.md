# ENTECH Dashboard

ระบบติดตามงานพนักงาน — Employee task tracking with centralised admin control.

- ผู้ดูแลระบบสร้างและระงับบัญชีพนักงานได้ทั้งหมด (admins provision and revoke employee accounts)
- หน้าหลักแบ่งงานเป็น 2 หมวด: **งานที่กำลังดำเนินการ** และ **ประวัติงานที่เสร็จแล้ว** (เก็บเป็นหลักฐาน แก้ไขไม่ได้)
- รองรับภาษาไทยและอังกฤษ สลับได้ทันที
- บันทึกการใช้งานแบบ append-only ลบหรือแก้ไขไม่ได้

**Stack:** Next.js 15 (App Router) · TypeScript · Prisma · PostgreSQL · Tailwind v4 · Vercel

---

## Setup

Requires Node 20.11+ and a PostgreSQL database (Neon or Supabase both work).

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Pooled connection used at runtime |
| `DIRECT_URL` | Non-pooled connection for migrations; same value if your provider has no separate one |
| `SESSION_SECRET` | 32+ random characters — `openssl rand -base64 48` |
| `APP_URL` | Must match the deployed origin exactly in production |
| `SEED_ADMIN_*` | Bootstrap admin only; remove after the first seed |

Then create the schema and the first administrator:

```bash
npm run db:migrate
npm run db:seed
```

```bash
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
   DATABASE_URL="<production url>" npm run db:deploy
   ```
5. Seed the first admin the same way, then unset the seed variables.

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
