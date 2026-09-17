# Tasks with several assignees

A task may be the work of more than one person, on exactly the terms a field
trip already is. This spec records the decisions; the trip work (PR #8) is the
worked example for every one of them.

## Data model

`Task.assigneeId` is replaced by a pairing table:

```
TaskAssignee (taskId, employeeId)   PK (taskId, employeeId), index (employeeId)
  taskId     → Task      onDelete: Cascade
  employeeId → Employee  onDelete: Restrict
```

No lead, no order, no extra columns — the row *is* the fact. The migration is
one file in three ordered steps: create the table, backfill every existing
task to a list of one from its `assigneeId`, then drop the column and its
`[assigneeId, status]` index. Split across two migrations there would be a
deploy window with tasks that have nobody on them.

"At least one assignee" cannot be said by the database and lives in
`validation.ts`, as `travellerIds` already does for trips. The list reaches
the server as one comma-separated `assigneeIds` field for the reason
`employeeIds` does: `formDataToObject` collapses a repeated name to its last
value.

## Authorization

- `canMutateTask(user, { assigneeIds })` — admin, or anyone in the list. Both
  the status change and completion go through it, the way `canRunFieldTrip`
  covers start and complete.
- `createTaskAction` for a non-admin still pins the list to `[user.id]`. The
  1.4.0 rule is unchanged: an employee creates work for themselves and nobody
  else.
- `scopedAssigneeId()` and `assigneeScope()` stay the single place narrowing
  is expressed. Only their *shape* changes: the Prisma filter becomes
  `{ assignees: { some: { employeeId } } }`, and `assigneeScopeSql` becomes an
  `EXISTS`, mirroring `travellerScopeSql`.

## Counting

The trip invariant, applied unchanged:

- `getTaskSummary()` (company-wide) uses `EXISTS` — a three-person task is one
  unit of work, and counts once.
- `getEmployeeWorkloads()` (per person) joins — that task is three people's
  work and belongs in all three frames.
- `getWorkloadTasks()` narrows through `assigneeScope()`, so a capsule's list
  agrees with the number that opened it.

## Editing and the trail

`assigneeId` leaves `EDITABLE_FIELDS`; the list is diffed by hand as a set
(reordering is not an edit) and written into `changes.assignees` as joined
staff codes — the copy of what `updateFieldTripAction` does for `travellers`.
The CREATED event's note names every code: "มอบหมายให้ ENT-0001, ENT-0002".

## UI

- The traveller chip picker in `TripForm` is lifted into `PeoplePicker` and
  both forms use it. `lockedAssignee` becomes `lockedAssignees`.
- The task card lists every assignee, wrapping, as the trip card does.
- The calendar's day list and sticky note summarise with the existing
  `travellerSummary()`, renamed `peopleSummary()` since it now names both.
- On the admin dashboard a calendar entry links to the **first** assignee's
  page. The task is on every assignee's page, so any of them is a true
  destination; the first is the cheapest to pick and stable across renders.

## Employee gates

`deactivateEmployeeAction` and `deleteEmployeeAction` count open work through
the new relation (`taskAssignments`). The meaning is unchanged: an account
with a task still on it cannot be closed.

## Out of scope

Trips (already done), a "lead" assignee, notifications, and any change to
what an employee may create for themselves.

## Verification

`lint`, `typecheck`, `build`; the migration applied deliberately with
`db:deploy`, followed by `prisma/supabase-02-harden.sql` because a table was
added; a look at the dashboard, the admin task list and the calendar at 375px
and desktop.
