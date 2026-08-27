import { redirect } from "next/navigation";

import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { AuthorizationError } from "@/lib/errors";

/**
 * Authorization is enforced here, on the server, for every page and every
 * server action. middleware.ts only does a cheap cookie-presence check to keep
 * unauthenticated traffic off the database — it is not the security boundary.
 */

export { AuthorizationError } from "@/lib/errors";

/** Page guard: redirects to /login when there is no valid session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Page guard: redirects non-admins to their own dashboard. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

/**
 * Server-action guard. Throws instead of redirecting so the action can return a
 * structured error to the client.
 */
export async function assertUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError("กรุณาเข้าสู่ระบบใหม่ / Please sign in again");
  return user;
}

export async function assertAdmin(): Promise<SessionUser> {
  const user = await assertUser();
  if (user.role !== "ADMIN") throw new AuthorizationError();
  return user;
}

/** An employee may touch a task only if they own it; admins may touch any task. */
export function canMutateTask(user: SessionUser, task: { assigneeId: string }): boolean {
  return user.role === "ADMIN" || task.assigneeId === user.id;
}

/**
 * Who may start or complete a field trip.
 *
 * Deliberately wider than the rest of FieldTrip: scheduling, editing, and
 * cancelling stay admin-only, because the schedule is something an admin plans
 * and other people arrange their week around. Starting and finishing a trip is
 * the opposite — it is the traveller reporting from the field — so the person
 * named on the trip may do it as well.
 */
export function canRunFieldTrip(
  user: SessionUser,
  trip: { employeeId: string },
): boolean {
  return user.role === "ADMIN" || trip.employeeId === user.id;
}
