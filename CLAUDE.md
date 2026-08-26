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

## Deployment

Hosted on Netlify, but **not** through Netlify's Git integration — that gate
requires Pro for a private organization-owned repo. `.github/workflows/deploy.yml`
builds in GitHub Actions and uploads with the Netlify CLI, so the repo stays
private and inside the org. Pushing to `main` deploys.

Runtime config lives in Netlify's site environment variables, never in GitHub
secrets; the CLI pulls it into the build. GitHub only holds NETLIFY_AUTH_TOKEN
and NETLIFY_SITE_ID.

**Migrations are not automated.** The workflow never runs `prisma migrate
deploy` — an auto-migration on every push is a bad trade for a system whose
completed-task archive is meant to be evidence. Apply them deliberately:

```bash
npm run db:deploy
```

**Any migration that adds a table needs a follow-up.** Run
`prisma/supabase-02-harden.sql` in the Supabase SQL Editor afterwards; it is
idempotent and re-asserts RLS and the role lockout on the new tables. See
"Database hosting" below for why.

## Architecture

Next.js 15 App Router, TypeScript, Prisma + PostgreSQL (Supabase), Tailwind v4.
Deployed on Netlify. No auth library: sessions are hand-rolled in `src/lib/auth/`.

### Database hosting

Supabase is used **only as a Postgres host**. This app does not use Supabase
Auth, Storage, PostgREST, or `@supabase/supabase-js`, and needs no anon or
service_role key. Prisma connects over plain Postgres. Do not introduce the
Supabase client to solve a problem the server layer already handles — it would
put a second, differently-secured path to the same data.

Tables live in the **`app` schema, not `public`**, selected via `?schema=app` on
both connection URLs. This is a security requirement, not a preference: Supabase
exposes `public` over PostgREST to the anon key and grants that role access to
tables created there by default, which would publish `Employee.passwordHash` and
`Session.tokenHash` to a key meant for browser code. `prisma/supabase-01-init.sql`
creates the schema and revokes the API roles; `prisma/supabase-02-harden.sql`
adds deny-all RLS and must be re-run after any migration that adds a table.

Secrets live in `.env`, not `.env.local`. The Prisma CLI and `tsx` read only
`.env`; Next.js reads both. Keeping one file avoids the migrate-vs-runtime
config drift that two files invite. `npm run db:seed` passes `--env-file=.env`
because `tsx` does no env loading of its own.

Two connection strings, and they are not interchangeable: `DATABASE_URL` is the
transaction pooler (port 6543, `pgbouncer=true&connection_limit=5`) because
serverless invocations would otherwise exhaust the connection limit, while
`DIRECT_URL` must be a session-level connection (port 5432) because Prisma
migrate uses advisory locks a transaction pooler cannot carry.

### Round trips are the performance budget

Every query through the production pooler costs **~250ms of pure overhead**, and
it is not the network — the TCP handshake to that host is 60ms, and the same
query on the session connection is ~60ms. It is `pgbouncer=true`, which disables
Prisma's prepared-statement cache so each query re-parses across several round
trips.

**That flag cannot be removed.** Transaction pooling hands consecutive queries to
different server connections, so a prepared statement made on one is gone by the
next; removing it and running 1200 queries produced 1102 `26000 prepared
statement "sN" does not exist` failures.

Session mode (`:5432`) has no such problem and is ~3x faster end to end (the
admin dashboard: 2598ms through the pooler, 926ms direct), and `DEV_DIRECT_DB=1`
routes **development** through `DIRECT_URL` to get it. It is opt-in, not the
default, and it is not an option in production at all: session mode holds a
server connection per client connection, and the pool gives out around a couple
of dozen. When it does, Supavisor refuses the TCP connection and Prisma reports
`P1001 Can't reach database server` — which reads like an outage rather than a
full pool, and is why the reliable connection is what a fresh checkout gets.

So the only lever is **making fewer round trips**, and it is a real constraint,
not a micro-optimisation: a page that makes a dozen costs three or four seconds.
Two consequences for new code:

- `connection_limit` must stay above 1. At 1 every `Promise.all` in the query
  layer silently serialises behind the single connection — a batch of 8 queries
  measured 3.8s at `connection_limit=1` and 0.97s at 10.
- Prefer one aggregate query to several that scan the same rows under the same
  scope. `getTaskSummary()` and `getEmployeeWorkloads()` are raw SQL with
  `FILTER` clauses for exactly this reason — they were 3 and 4 round trips and
  are now 1 and 2. Raw SQL there addresses tables schema-qualified (`app."Task"`)
  rather than trusting `search_path`, and derives its `WHERE` from
  `scopedAssigneeId()` so the narrowing rule still lives in one place.

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

`assigneeScope()` is the one place that narrowing is expressed. An optional
`assigneeId` argument can only ever narrow further: for a non-admin the scope is
pinned to their own id and the argument is discarded outright, never merged over
the scope, so a person id typed into a URL cannot widen anything.

The single deliberate exception is `getCompletedTasks()`, which is **not**
narrowed to the caller — see "The two-section model" below.

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

The completed archive is **readable by every signed-in employee**, not just the
assignee: finished work is a shared record, which is the point of keeping it as
evidence. Reading is all that grants. Mutation is unchanged and enforced in the
actions, not the UI — `canMutateTask()` (admin or assignee) guards status and
completion, and reopening is admin-only. A card rendered for someone else's task
therefore shows no controls at all.

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

### Field trips

`FieldTrip` records who is off-site, where, and on which days. Admin-only to
write (`src/server/actions/field-trips.ts`), readable by anyone signed in — the
schedule exists so the team can see who is out, so `getFieldTrips()` takes no
`SessionUser` and narrows by nothing but an optional `employeeId`.

Trips have **no page of their own**: assigning one is assigning work, so they
live inside `/admin/tasks`, and the "new task" button carries a type switch that
swaps the task fields for the trip fields. Everyone else sees them through the
calendar and the off-site panel on the dashboard.

Trips are **cancelled, not deleted**: people plan around them, and a trip that
silently vanishes is worse than one marked cancelled with a reason. Cancelled
trips stay in the list and drop off the calendar.

The day range is inclusive and expanded per-day in `CalendarSection` — a trip
from the 3rd to the 5th becomes three calendar entries, clipped to the month on
show, so one crossing a month boundary appears correctly in both.

`ScheduleRow` pairs the calendar with `AwayPanel`: the calendar answers "what
happens on the 14th", the panel answers "where is everyone right now". Either
can be switched off, and whichever remains takes the full width.

### Maps

`frame-src 'self' https://www.google.com` in `next.config.ts` is the one opening
in an otherwise self-only CSP. It is narrow on purpose — one host, frames only,
no scripts and no connections — and it is what lets a trip show a real map
rather than a link.

`src/lib/maps.ts` produces both URLs, and the difference matters:

- `mapsHref()` opens in a new tab and may be a link someone pasted.
- `mapEmbedSrc()` is the `<iframe src>` and is **always** built from coordinates
  or a place name, never from a pasted link. A frame loads silently, so its
  source must be one this code composed; a new tab shows the user where they are
  going. `output=embed` needs no API key, which matters because this app has none.

A pasted `mapUrl` is also validated against a Google host allowlist in
`validation.ts` — it is rendered as a link people are invited to click, so an
arbitrary URL there would turn the trip form into a way to plant one.

`MapEmbed` creates the iframe only once someone opens it: a page can carry a
dozen trips, and a dozen eagerly-loaded map frames would cost more than the page.

### UI switches

`AppSetting` is a key-value table of admin-controlled toggles. Defaults live in
`src/lib/settings/settings.ts`, and a row exists only where an admin has
overridden one — so a fresh database behaves exactly like an untouched install,
and adding a toggle is a code change, not a migration.

`getSettings()` is cached twice over: `unstable_cache` across requests, and
React `cache()` within one. Seven booleans that change a few times a year do not
deserve a round trip per request. The app layout publishes the result through
`SettingsProvider`, so the task cards (client components) read it with
`useSettings()` instead of it being drilled through every page.

`setSettingAction` must call `revalidateTag(SETTINGS_CACHE_TAG)` as well as
`revalidatePath` — re-rendering a page that then reads the stale cached value
would change nothing. The 60-second `revalidate` ceiling is a backstop, not the
mechanism: `dashboard.sharedHistory` decides what the query layer selects, so if
a tag revalidation is ever missed, switching the shared archive off has to take
effect on its own.

Two of the switches are not cosmetic and are enforced on the server, not by
hiding elements: `dashboard.sharedHistory` narrows `getCompletedTasks()` in the
query layer, and `dashboard.showCalendar` skips the month query entirely. If you
add a switch that governs what someone may *read*, enforce it in
`src/server/queries.ts` the same way — never only in the component.

### Task dates

Four, and they are not interchangeable. `startDate` and `dueDate` are the
*planned* window an admin sets when assigning; `startedAt` and `completedAt`
record what actually happened and are written by the lifecycle actions. The
calendar buckets by `dueDate`.

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
so each serverless instance counts separately — it slows a naive attacker but is
not a hard ceiling. The authoritative control is `src/lib/auth/login-throttle.ts`,
which is database-backed and applies an exponential per-account lockout
(5 failures → 1 min, doubling to 30 min). If you need a real distributed limit,
swap the internals of `rate-limit.ts` for Upstash Redis; the exported signature
is designed not to change.

### Passwords

Argon2id via `@node-rs/argon2` (prebuilt binaries; listed in
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
