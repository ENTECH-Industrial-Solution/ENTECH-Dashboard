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

Hosted on Vercel through its Git integration: pushing to `main` builds and
deploys. That integration will not pull a *private* repository owned by a
GitHub organization on a free plan, which is why **this repo is public**. The
same gate is what previously forced the build-in-Actions, upload-with-the-CLI
detour on Netlify.

Because the repo is public, the server-side guards in `src/lib/auth/rbac.ts`
are readable by anyone. They are also the only thing protecting the data — do
not relax one on the assumption that the logic is private. Nothing secret may
enter the repo; `.env` is gitignored and must stay that way.

The Vercel project runs on the **Hobby** plan, which is free and has no
billing mechanism at all — a Hobby account cannot buy usage, so exceeding a
limit pauses the resource rather than producing a bill. Hobby is however
licensed for non-commercial use, and this is an internal company tool. The
foreseeable failure mode is Vercel asking for a Pro upgrade, not a charge.

Runtime config lives in Vercel's project environment variables, never in the
repo. `SEED_ADMIN_*` must **not** be set there — they exist only for the first
local `npm run db:seed` — and neither must `DEV_DIRECT_DB`, whose session-mode
connection cannot carry serverless traffic.

`vercel.json` pins functions to `sin1`. This is not a preference: the database
is in `ap-southeast-1`, and Vercel's default `iad1` would pay a cross-Pacific
round trip on *every query*, which is the one cost this app cannot absorb (see
"Round trips are the performance budget"). Verify it from the `x-vercel-id`
response header, which reads `<edge>::<function-region>::<id>` — the middle
field must be `sin1`:

```bash
curl -sS -o /dev/null -D - https://entech-dashboard.vercel.app/login | grep -i x-vercel-id
```

Vercel's build runs `npm run build` and nothing else — it neither typechecks
nor lints. `.github/workflows/ci.yml` is what does, and it is the only gate
between a red `tsc` and production.

**Migrations are not automated.** Neither Vercel nor CI runs `prisma migrate
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
Deployed on Vercel. No auth library: sessions are hand-rolled in `src/lib/auth/`.

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

Reads normally happen while a page renders. The one that does not is
`getWorkloadTasks()`, reached through `loadWorkloadTasksAction` when someone
opens a capsule in the summary strip (see "The summary strip"). A read action is
not a mutation: it skips `runAction` — no FormData, no field errors, nothing to
revalidate — but keeps the part that matters, never throwing across the
boundary. It still calls a guard (`assertUser()`), still parses its arguments
with Zod, and still narrows through `assigneeScope()`, so the id in its payload
can only select rows the caller could already read. Follow that shape if you add
another read action; do not let one skip the guard because "it only reads".

### The summary strip

`SummaryTiles` renders the three headline counts, and — when more than one
person is in view — a capsule per person under each. The tile is a server
component; only the capsules are client-side, because only they hold state.

Each capsule opens **in place** onto the tasks behind it. Not a dialog: the list
is a few lines of context for the number directly above it.

That list is fetched **when the capsule is opened**, not with the page. The strip
carries up to twelve capsules and almost nobody opens more than one, so loading
every list up front would add a round trip and the whole company's task rows to a
page that makes three (see "Round trips are the performance budget"). Answers are
kept per capsule, so reopening one costs nothing, and only the first few tasks
are listed — the capsule already states the total, so the list says how many it
left out.

`getWorkloadTasks()` uses the same three predicates `getTaskSummary()` counts
with. Keep them in step: a list that disagrees with the number that opened it is
worse than no list.

All three numbers count **tasks and field trips together**, and that invariant
now spans three layers that must agree: `getTaskSummary()` (the headline),
`getEmployeeWorkloads()` (the per-person capsule values), and
`getWorkloadTasks()` (the list a capsule opens onto). A trip counts as active
while it is neither cancelled nor completed, as overdue once its inclusive
`endDate` is behind the *start of today in Bangkok* — not `now()`, or a trip
ending today would read as late from one minute past midnight — and as
completed once it is closed out. Cancelled trips count as nothing anywhere:
they did not happen.

Counting trips only in the finished number was the tempting half-measure and it
is wrong: "completed" would climb without "active" ever falling, and the three
would stop describing one pool of work. `EmployeeWorkload.active` is therefore
no longer `todo + inProgress + blocked` — those three name TaskStatus values
and stay task-only.

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

Both are drawn on `CardGrid`, which opens showing **one row** and keeps the
rest behind a "ดูเพิ่มเติม (+n)" button. The hidden cards are not rendered at
all until it is pressed — they are client components carrying form state, and a
two-hundred-card archive is two hundred hydrations for cards nobody has looked
at. What that costs is the anchor: a card that does not exist cannot be jumped
to, and both the summary capsules and the calendar link at `#task-<id>` /
`#trip-<id>`. So a grid that cannot find the hash opens itself to look for it,
and the grids it does not belong to close again — if you add a section, use
`CardGrid` rather than a bare grid, or its links will land nowhere.

The completed archive is **readable by every signed-in employee**, not just the
assignee: finished work is a shared record, which is the point of keeping it as
evidence. Reading is all that grants. Mutation is unchanged and enforced in the
actions, not the UI — `canMutateTask()` (admin or assignee) guards status and
completion, and reopening is admin-only. A card rendered for someone else's task
therefore shows no controls at all.

A completed task's **lifecycle** is closed. `updateTaskStatusAction` refuses to
touch a `COMPLETED` task; the only way back out is `reopenTaskAction`, which is
admin-only, demands a written reason, preserves the original `completionNote`
and `proofUrl`, and writes both a `TaskEvent` and an `AuditLog` row.

Its **content** is not closed, and that is a deliberate change from the original
design. `updateTaskAction` lets an admin correct any task, archived or not:
title, description, assignee, priority, the planned dates, and — where the task
has one — the completion note and evidence link. What makes the archive
defensible is not that nothing can touch it; a wrong record defended to the
death is still a wrong record. It is that **every change to it is accounted
for**. So the edit is granted and the accounting is the part that is not
optional:

- an `UPDATED` `TaskEvent` naming the fields that moved, and
- an `AuditLog` row whose metadata carries a field-by-field `{from, to}` diff
  plus an `archived` flag marking edits that landed on a completed task,
- both written in the same `$transaction` as the edit.

Two things stay out of reach and should stay that way: `status`, which has its
own action and its own legal transitions, and the system's own timestamps
(`createdAt`, `startedAt`, `completedAt`). Those are not data to correct — they
are the record of when things happened, and editing them would be forging it.

`deleteTaskAction`, `deleteFieldTripAction`, and `deleteEmployeeAction` are the
**only three hard deletes in the application** — everything else is kept. All
three are admin-only, and the first two are offered to neither an assignee nor a
traveller: someone deleting their own assigned work is the one case this must
not make easy. All three demand a written reason, because once they run there is
nothing left to infer one from. The employee one is the narrowest of them and is
described under "Employees are deactivated, and deleted only when empty".

`deleteFieldTripAction` accepts a trip in **any** state, cancelled and completed
included, which is not a hole in the completed lock. That lock stops a finished
trip being rewritten or made to look cancelled — both ways of changing what the
record *says*. A delete does not change what it says; it removes the row and
leaves an entry stating so, with a reason and a copy of everything the row held.

`TaskEvent.taskId` is `onDelete: Cascade`, so the task's whole trail dies with
it. That is why the action snapshots the entire task **and every one of its
events** into the `AuditLog` metadata *before* the delete, in the same
`$transaction`: either both happen or neither does, and the surviving row is a
complete account of a task that no longer exists. Preserve that property if you
touch this — a delete that leaves only "someone deleted TSK-000042" is the
version of this feature the app should not have.

If you add a field to `updateTaskSchema`, add it to `EDITABLE_FIELDS` in
`src/server/actions/tasks.ts` too, or it will be written without appearing in
the diff — an edit nobody can see is the one outcome this design cannot have.

`TaskEvent` and `AuditLog` are append-only by convention: no application code
updates or deletes them, and the admin audit page exposes no such affordance.
Write the audit row inside the same `$transaction` as the mutation it describes
(pass `tx` to `writeAudit`) so state and evidence cannot drift apart.

### Field trips

`FieldTrip` records who is off-site, where, and on which days. Readable by
anyone signed in — the schedule exists so the team can see who is out, so
`getFieldTrips()` takes no `SessionUser` and narrows by nothing but an optional
`employeeId`.

Writing splits in two (`src/server/actions/field-trips.ts`). **Scheduling** —
create, update, cancel — is admin-only, because the schedule is something an
admin plans and other people arrange their week around. **Running** a trip is
not: `startFieldTripAction` and `completeFieldTripAction` are the traveller
reporting from the field, so they go through `assertUser()` +
`canRunFieldTrip()` (admin, or the person named on the trip) instead of
`assertAdmin()`. That is the only widening, and it is the reason the buttons
appear in `AwayPanel` on the dashboard — `/admin/tasks` is admin-only, so it is
the only view of a trip an employee has.

A trip's four states are read off three nullable timestamps by `tripState()`:
scheduled → on-site (`startedAt`) → completed (`completedAt`), with cancelled
(`cancelledAt`) as the other terminal end. `startDate`/`endDate` stay the
*planned* days; `startedAt`/`completedAt` record what actually happened, the
same split `Task` draws between `dueDate` and `completedAt`.

Completing writes an optional summary and an optional `proofUrl`. Optional,
unlike a task's completion note, is deliberate: a trip's evidence is that the
person was at the place on those days, and a required field at the end of a day
in the field is a field people fill with "-".

Completing closes the trip's *lifecycle*: it cannot be started again, completed
again, or cancelled — calling off a trip that was seen through to the end would
be rewriting what happened. Its *content* stays correctable, on exactly the
terms a completed task's is: `updateFieldTripAction` accepts a finished trip,
including its report, and writes a `diffFields()` before/after plus an
`archived` flag into the audit row. A **cancelled** trip stays closed to edits —
it never happened, so there is nothing about it to correct. There is no reopen
path for either; do not add one without the reason-and-audit shape
`reopenTaskAction` uses.

`TripActions` is the single row of controls a trip carries, shared by the card
and the off-site panel. One row, not two: splitting "what the traveller does"
from "what the admin does" made a card look like it had two unrelated toolbars.
Which buttons appear is decided from the trip's state and from props the server
sets — and `cancelAction` being *absent* is how `/admin/tasks` withholds the
cancel button from trips already in the past. The row is a grid of
`auto-fill` equal tracks so every button on a card is the same width whatever
the mix, reflowing on the *card's* width rather than the viewport's.

Trips have **no page of their own**: assigning one is assigning work, so they
live inside `/admin/tasks`, and the "new task" button carries a type switch that
swaps the task fields for the trip fields. Everyone else sees them through the
calendar and the off-site panel on the dashboard.

Trips are **cancelled, not deleted**: people plan around them, and a trip that
silently vanishes is worse than one marked cancelled with a reason. Cancelled
trips stay in the list and drop off the calendar.

The upcoming/past split is **by date alone**. Completing a trip does not move it
between the two, exactly as cancelling one does not: both stay in the list they
were in, wearing the badge that says what became of them, and roll into the past
when their days are over. `AwayPanel` is the exception that matters — a
completed trip leaves "ออกอยู่ตอนนี้" the moment it is closed out and moves to
its own group, because "who is out right now" is the one question a finished
trip is no longer an answer to. Nothing is ever deleted, so `window: "past"` is
the permanent record: `TripHistory` is one person's copy of it, on their
dashboard and their page, and `/admin/tasks` carries everyone's.

The day range is inclusive and expanded per-day in `CalendarSection` — a trip
from the 3rd to the 5th becomes three calendar entries, clipped to the month on
show, so one crossing a month boundary appears correctly in both.

**Every view of a trip must show its state.** `CalendarTrip` carries one for
exactly this reason: without it the calendar labelled every entry
"ออกนอกสถานที่" in warning orange, so a trip closed out an hour ago still
announced that the person was off-site — on the day they had just reported
back. Cancelled trips are dropped from the calendar; completed ones are not,
because they happened, but they say so.

`startTime` / `endTime` are `"HH:MM"` strings and **nullable on purpose**: null
means nobody said, and `tripHours()` in `src/lib/calendar.ts` fills in the
office hours (`OFFICE_HOURS`, 08:30–16:30) at display time. Storing the default
instead would make "08:30 because that is the rule" indistinguishable from
"08:30 because someone chose it", and would pin today's rule into every
existing row. They are deliberately kept out of `startDate`/`endDate`, which
stay pure Bangkok calendar days — `dayStart()`, `bangkokDayKey()` and the
upcoming/past boundary all bucket on them, and a time of day would silently
move a trip between days.

`ScheduleRow` pairs the calendar with `AwayPanel`: the calendar answers "what
happens on the 14th", the panel answers "where is everyone right now". Either
can be switched off, and whichever remains takes the full width.

Side by side, **the calendar decides how tall the row is.** Grid items stretch
to the tallest, and the panel was the tallest, so a busy week dragged the row
down and left the two ending at different lines. The panel is therefore lifted
out of flow — `lg:absolute lg:inset-0` inside a `relative` grid item — so it
contributes no height at all: the row is the calendar's, the panel stretches to
exactly that, and the groups scroll inside it under a pinned heading
(`min-h-0 flex-1 overflow-y-auto`; without `min-h-0` a flex item refuses to
shrink below its content). Both the absolute positioning and the two-column
grid start at `lg`, so they switch together — stacked below it, each takes its
natural height and there is nothing to align to.

`h-full` and not `max-h-full`, and this has been decided once already: sizing
the panel to its trips does remove the empty space under a quiet week, but it
also leaves the two columns ending on different lines, which reads as a broken
row rather than an empty one. The two boxes matching is worth more than the
space they sometimes waste — ask before trading it back.

Inside each group, **one box is one person, not one trip**, and the boxes run
left to right. The panel is a third of the dashboard wide and no taller than
the calendar beside it, so a column of full-width cards buried everyone past
the second name; laid sideways, one box is exactly what the panel is sized for
and the rest wait beside it. Someone with two trips on the same day gets one
box holding both — the question this panel answers is about people. The count
on the group heading still counts *trips*, because that is the number the
calendar and the summary strip put on the same group.

`SlideRow` is that row, and it draws no bar (`scroll-bare`, as the panel's own
scroll already does). Two things replace it. `.slide-card` sizes a box at 85%
of the row, so the next one shows past the edge — the cue that costs no chrome
and works on a phone. And the arrows in the heading, which appear only when
there is somewhere to go: a trackpad swipes sideways but a mouse wheel does
not, so a desktop with neither bar nor arrows would be a row nobody could move.
The 17.5rem floor on a box is not arbitrary — below it the location block
inside gives up putting its map beside the address, and every box grows half
again as tall.

One consequence to keep in mind: `#trip-<id>` now lands on a block *inside* a
box rather than on the box itself, so `.trip-anchor:target` is what rings it.

### Framed third parties

`frame-src` in `next.config.ts` is the one opening in an otherwise self-only
CSP, and it names exactly three hosts: `www.google.com` for a trip's map,
`www.youtube-nocookie.com` and `drive.google.com` for a video evidence link.

**Every one of them earns its place the same way, and any fourth must too:**
frames only — no scripts, no connections — and *the `src` is always composed by
our own code from an id or a place name, never from a URL somebody pasted*. A
frame loads silently, so its source has to be one we built; a link opens in a
tab where the person can see where it goes. `src/lib/maps.ts` and
`src/lib/video.ts` are the two places that composing happens, and both answer
"not recognised" by falling back to a plain link — which is what keeps that
host list from ever needing to grow.

`img-src` also names `https://i.ytimg.com`, which is not cosmetic: the poster
frame inside a YouTube embed is measured against *this* page's policy, not
YouTube's. Removing it makes the frame report an `img-src` violation while
Google Maps frames on the same page report nothing.

### Maps

`src/lib/maps.ts` produces both URLs, and the difference matters:

- `mapsHref()` opens in a new tab and may be a link someone pasted.
- `mapEmbedSrc()` is the `<iframe src>` and is **always** built from coordinates
  or a place name, never from a pasted link. A frame loads silently, so its
  source must be one this code composed; a new tab shows the user where they are
  going. `output=embed` needs no API key, which matters because this app has none.

A pasted `mapUrl` is also validated against a Google host allowlist in
`validation.ts` — it is rendered as a link people are invited to click, so an
arbitrary URL there would turn the trip form into a way to plant one.

### Video evidence

A `proofUrl` that is a YouTube or Drive link plays in place; anything else stays
a link, and there is no separate video field — people already paste links into
the evidence box, so the feature is "the link you already gave us works".
`videoEmbed()` returns null unless it positively recognises the host, the shape
*and* the id, so a lookalike host or a Drive folder link falls through to a
link.

`VideoPlayer` is **click-to-load**, not the `IntersectionObserver` `MiniMap`
uses, and the difference is weight: a map tile is an image, a YouTube player is
an application. The completed archive can hold a hundred cards, and a hundred
players initialising on scroll would cost more than the rest of the page put
together. The click creates the frame, and `autoplay=1` in the composed src
means that one click both loads it and starts it.

Drive enforces its own sharing rules inside the frame: a viewer without access
to the file gets a request-access box, not the video. For something the whole
team should watch, an unlisted YouTube link is the lower-friction choice.

`MiniMap` shows the map as a thumbnail beside the location and opens the same
map full size, in a portalled dialog, when it is clicked. Two rules keep that
affordable:

- The iframe is created only when the thumbnail comes near the viewport
  (`IntersectionObserver`, 300px margin), and never a second time. A page can
  carry a dozen trips, and a dozen eagerly-loaded Google frames cost more than
  the page — below the fold they cost nothing. What *is* on screen does load,
  which is the price of not making people click to find out where a place is.
- The thumbnail is a button with `pointer-events: none` on the frame, so a
  112px map cannot swallow a click or a page scroll. Only the dialog's map is
  interactive.

The thumbnail's size is a **container** query, not a viewport one: the same
block is a third-width panel on the dashboard and a full-width card on
`/admin/tasks`, and only the block knows which. Below a 224px container there
is no "beside" left and it stacks.

### UI switches

`AppSetting` is a key-value table of admin-controlled toggles. Defaults live in
`src/lib/settings/settings.ts`, and a row exists only where an admin has
overridden one — so a fresh database behaves exactly like an untouched install,
and adding a toggle is a code change, not a migration.

`getSettings()` is cached twice over: `unstable_cache` across requests, and
React `cache()` within one. Thirteen booleans that change a few times a year do
not deserve a round trip per request. The app layout publishes the result through
`SettingsProvider`, so the task cards (client components) read it with
`useSettings()` instead of it being drilled through every page.

`setSettingAction` must call `revalidateTag(SETTINGS_CACHE_TAG)` as well as
`revalidatePath` — re-rendering a page that then reads the stale cached value
would change nothing. The 60-second `revalidate` ceiling is a backstop, not the
mechanism: `dashboard.sharedHistory` decides what the query layer selects, so if
a tag revalidation is ever missed, switching the shared archive off has to take
effect on its own.

**`SETTING_IMPACT` is the classification that keeps the switches honest**, and
every new one has to declare which of the three it is:

- `display` — draws less, and nothing else changes.
- `reads` — *also skips a query*. `dashboard.showCalendar`, `showSummary`,
  `showPeople`, `fieldTrip.enabled` and `fieldTrip.showHistory` return before
  fetching rather than hiding what they fetched. A switch that claims this on
  the page and then fetches anyway is a lie the admin cannot see through.
- `access` — decides what someone may *read*. `dashboard.sharedHistory` narrows
  `getCompletedTasks()` in the query layer. Enforce these in
  `src/server/queries.ts` or the action, never only in the component.

`dashboard.showPeople` governs the per-person frames *and* the capsules in the
summary strip, because `getEmployeeWorkloads()` is the one read behind both;
splitting them into two switches would have left one of them unable to save the
query it advertises.

The settings page reads one thing beyond the values: `getSettingProvenance()`
answers where each value came from — whether a row exists at all, and who last
changed it, from the audit trail. It is deliberately not part of `getSettings()`,
which every request makes. "คืนค่าเริ่มต้น" (`resetSettingAction`) **deletes**
the row rather than writing the default into it, so "never touched" and "put
back" remain the same state, which is what the whole defaults-live-in-code rule
depends on.

### Task dates

Four, and they are not interchangeable. `startDate` and `dueDate` are the
*planned* window an admin sets when assigning; `startedAt` and `completedAt`
record what actually happened and are written by the lifecycle actions.

The calendar plots the two *planned* dates, never the actual ones.
`getTasksInMonth()` selects a task if either falls inside the month, and
`CalendarSection` then expands it into up to two entries carrying
`kind: "due" | "start"` — checking each date against the month again, because a
task can qualify on one and not the other. A task whose start and due land on
the same day yields one entry, the deadline: two rows on a cell saying the same
thing is worse than one. `toneOf()` gives a start entry a muted dot rather than
the red one, and only ever reds a missed `dueDate` — a start date in the past is
a fact, not a problem, and colouring it as overdue would make the calendar cry
wolf. A task with neither planned date appears nowhere on it, which is why an
edit that empties `dueDate` silently drops the task off the calendar.

### Employees are deactivated, and deleted only when empty

`deactivateEmployeeAction` is the normal end of an account: it sets
`isActive = false`, revokes sessions, and keeps every task and audit row intact.
It refuses when the employee still has open tasks, when the target is the
caller, and when the target is the last active admin.

`deleteEmployeeAction` removes the row outright, and every one of its gates
exists because "never hard-deleted" was right for the case it was written for
and wrong for the one it also caught. An account with work behind it must stay:
the completed archive is evidence, and evidence whose author has been deleted is
worth less than an inactive row in a list. An account with *nothing* behind it —
a code typed wrong, a duplicate, someone who never signed in — is not evidence
of anything, and leaving it permanently deactivated makes every admin read past
it forever. So:

- the account must already be deactivated (an active one is refused outright),
  which also means no live session is cut off mid-request;
- nothing may still reference it — assigned or created tasks, trips travelled or
  scheduled. Those keys are `onDelete: Restrict` and would refuse anyway;
  counting first turns a database error into a sentence naming what to move;
- the caller may not delete themselves;
- a reason is required, and the audit row carries it with a field-by-field
  snapshot of the account. **Never spread the employee row into that metadata**
  — `passwordHash` is on it, the audit page renders metadata, and this
  repository is public. The snapshot names its fields one at a time for exactly
  that reason.

What the person leaves behind survives them: `TaskEvent.actorId` and
`AuditLog.actorId` are `onDelete: SetNull` and both carry a denormalised
`actorLabel`, so the trail still reads "ENT-0002 — สมหญิง" with nothing left to
point at.

`employeeCode` **is editable** (`updateEmployeeSchema`), and the audit row for a
rename is `employee.code.changed` carrying the before/after, so a row filed
under the old code can still be found. A rename does not revoke sessions, unlike
a role change: the session is keyed on the row id, the person keeps exactly the
access they had, and only what they type at the login form has moved.

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
- The component primitives in `globals.css` (`.btn`, `.card`, `.panel`, `.input`,
  `.badge`) are **unlayered CSS, and unlayered beats every Tailwind utility** —
  utilities live in `@layer utilities`, and a layered rule loses to an unlayered
  one no matter how specific or how late it is. So `className="btn lg:hidden"`
  hides nothing and `className="btn px-2"` retightens nothing: any utility that
  sets a property the primitive also sets is silently dead. Utilities that touch
  *other* properties (`w-full`, `ms-auto`, `grid-cols-*`) work as expected.
  Where a primitive has to be hidden or repositioned responsively, put the
  utility on a plain wrapper around it — `AppNav`'s menu button is the worked
  example.
- Prisma `schema.prisma` carries the invariants as comments — read them before
  changing a model.
