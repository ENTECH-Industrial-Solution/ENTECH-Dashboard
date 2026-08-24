# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # dev server on :3000
npm run build        # prisma generate + next build
npm run lint         # eslint .
npm run typecheck    # tsc --noEmit
npm run db:push      # sync schema to DB without a migration (dev only)
npm run db:migrate   # create + apply a migration (dev)
npm run db:deploy    # apply pending migrations (CI/production)
npm run db:studio    # Prisma Studio
npm run db:seed      # create the bootstrap admin; needs SEED_ADMIN_* env vars
```

There is no test suite yet. When adding one, put unit tests next to the module
(`*.test.ts`) and run a single file with `npx vitest run path/to/file.test.ts`.

`npm run build` fails without a valid `DATABASE_URL` and `SESSION_SECRET`,
because `src/lib/env.ts` validates the environment at import time. To smoke-test
a build without a real database, pass dummy values inline — the build never
connects, it only imports.

## Architecture

Next.js 15 App Router, TypeScript, Prisma + PostgreSQL, Tailwind v4. Deployed on
Vercel. No auth library: sessions are hand-rolled in `src/lib/auth/`.

### The security boundary

**Authorization is enforced in server code only.** `src/middleware.ts` runs on
the Edge runtime, where Prisma and Argon2 are unavailable — it can see whether a
session *cookie exists*, never whether it is *valid*. Treat middleware as an
optimisation that keeps anonymous traffic off the database, and never as the
thing that protects a route.

The real guards live in `src/lib/auth/rbac.ts` and every page and server action
calls one:

- `requireUser()` / `requireAdmin()` — page guards, redirect on failure.
- `assertUser()` / `assertAdmin()` — action guards, throw on failure.
- `canMutateTask(user, task)` — admins may touch any task; employees only their own.

Adding a page under `src/app/(app)/` does **not** protect it by itself. Call a
guard in the page component.

### Request flow for a mutation

```
client component (useActionState)
  → server action in src/server/actions/*.ts
      → assertUser/assertAdmin              (authorization)
      → Zod schema from src/lib/validation.ts (shape + length)
      → db.$transaction: mutate + write TaskEvent/AuditLog together
      → revalidatePath
  ← ActionState (never throws across the boundary)
```

Every action body is wrapped in `runAction()` from `src/server/actions/types.ts`,
which converts Zod and authorization failures into a typed `ActionState` and
turns anything unexpected into a generic message — a stack trace never reaches
the browser. `runAction` deliberately re-throws Next.js's `redirect()` /
`notFound()` signals, which are implemented as thrown objects carrying a
`digest`.

### Read paths

All queries live in `src/server/queries.ts` and take the caller's `SessionUser`,
narrowing by it inside the function (`user.role === "ADMIN" ? {} : { assigneeId: user.id }`).
There is no client-supplied filter that could widen a result set. Keep new reads
in this file and follow the same shape.

### Sessions

Opaque 32-byte token in an httpOnly cookie; only its SHA-256 is stored, so a
database leak cannot be replayed as a login. Two expiry clocks — a 12-hour
absolute ceiling and a 1-hour idle window that slides forward (throttled to one
write per 5 minutes). `getCurrentUser()` is wrapped in React `cache()`, so a
page and its layouts share one lookup.

Sessions are revoked eagerly, not left to expire, on: password change, role
change, and employee deactivation. If you add another state change that should
cost someone their access, call `revokeAllSessions()` too.

### The two-section model

The dashboard's two sections map onto task status:

- **Active** (`งานที่กำลังดำเนินการ`) — `status != COMPLETED`
- **History** (`ประวัติงานที่เสร็จแล้ว`) — `status == COMPLETED`

Completed tasks are **immutable evidence**. `updateTaskStatusAction` refuses to
touch a `COMPLETED` task; the only way back out is `reopenTaskAction`, which is
admin-only, demands a written reason, preserves the original `completionNote`
and `proofUrl`, and writes both a `TaskEvent` and an `AuditLog` row. Do not add
a path that edits or deletes a completed task — that would defeat the point of
the archive.

`TaskEvent` and `AuditLog` are append-only by convention: no application code
updates or deletes them, and the admin audit page exposes no such affordance.
Write the audit row inside the same `$transaction` as the mutation it describes
(pass `tx` to `writeAudit`) so state and evidence cannot drift apart.

### Employees are never hard-deleted

"Delete employee" is `deactivateEmployeeAction`: it sets `isActive = false`,
revokes sessions, and keeps every task and audit row intact. It refuses when the
employee still has open tasks, when the target is the caller, and when the target
is the last active admin. `Task.assigneeId` uses `onDelete: Restrict` to make an
accidental hard delete fail loudly at the database.

### Login hardening

`loginAction` returns one identical message for unknown code, wrong password,
and malformed input. It calls `fakeVerify()` on the unknown-code path so timing
does not distinguish the cases, and checks `isActive` only *after* the password
verifies, so account existence is not leaked to an outsider.

Two independent limiters: `src/lib/rate-limit.ts` is per-IP and **in-memory**,
so on Vercel each instance counts separately — it slows a naive attacker but is
not a hard ceiling. The authoritative control is `src/lib/auth/login-throttle.ts`,
which is database-backed and applies an exponential per-account lockout
(5 failures → 1 min, doubling to 30 min). If you need a real distributed limit,
swap the internals of `rate-limit.ts` for Upstash Redis; the exported signature
is designed not to change.

### Passwords

Argon2id via `@node-rs/argon2` (prebuilt binaries, works on Vercel; listed in
`serverExternalPackages`). Admins never choose passwords — `createEmployeeAction`
and `resetPasswordAction` generate one with a CSPRNG, return the plaintext
exactly once to the calling admin as `ActionState.data`, and never store or log
it. The account is flagged `mustChangePassword`, which `src/app/(app)/layout.tsx`
enforces by redirecting to `/change-password` before any real page renders.

### Client/server module boundary

Client components import `idleState` and `ActionState` from
`src/server/actions/types.ts`, so **that file must not transitively import
server-only code**. This is why `AuthorizationError` lives in `src/lib/errors.ts`
rather than in `rbac.ts` (which imports `session.ts` → `next/headers`). If a
build fails with *"You're importing a component that needs next/headers"*, look
for a new import that dragged server code into a client bundle.

Dates are serialised to ISO strings before crossing into client components (see
the `serialise` helper in the dashboard pages).

### i18n

Thai (default) and English, from one flat dictionary in
`src/lib/i18n/dictionaries.ts`. The locale lives in a non-httpOnly cookie, so
switching never changes the URL. Two entry points: `getTranslations()` for server
components, `useTranslations()` for client components. Adding a UI string means
adding a key with both `th` and `en` — the `satisfies` constraint makes a missing
half a type error. Dates are formatted with `timeZone: "Asia/Bangkok"` pinned.

## Conventions

- Path alias `@/*` → `src/*`.
- `noUncheckedIndexedAccess` is on: indexing an array yields `T | undefined`.
- Colours come from CSS custom properties in `globals.css` (`var(--brand)`,
  `var(--danger)`, …), applied via inline `style`. Light and dark are a token
  swap, so components carry no `dark:` colour variants.
- Prisma `schema.prisma` carries the invariants as comments — read them before
  changing a model.
