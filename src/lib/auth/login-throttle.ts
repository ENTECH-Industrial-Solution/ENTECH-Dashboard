import { db } from "@/lib/db";

/**
 * Per-account brute-force protection, backed by the database so it survives
 * across serverless instances (an in-memory counter would reset on every cold
 * start and protect nothing).
 *
 * Lockout is exponential: 5 failures → 1 min, then doubling up to 30 min.
 */
const FAILURES_BEFORE_LOCKOUT = 5;
const BASE_LOCKOUT_MS = 60 * 1000;
const MAX_LOCKOUT_MS = 30 * 60 * 1000;

export type LockoutState = { locked: true; until: Date } | { locked: false };

export function checkLockout(employee: {
  lockedUntil: Date | null;
}): LockoutState {
  if (employee.lockedUntil && employee.lockedUntil > new Date()) {
    return { locked: true, until: employee.lockedUntil };
  }
  return { locked: false };
}

export async function registerFailedLogin(employeeId: string): Promise<void> {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { failedLoginAttempts: true },
  });
  if (!employee) return;

  const attempts = employee.failedLoginAttempts + 1;
  const over = attempts - FAILURES_BEFORE_LOCKOUT;

  const lockedUntil =
    over >= 0
      ? new Date(Date.now() + Math.min(BASE_LOCKOUT_MS * 2 ** over, MAX_LOCKOUT_MS))
      : null;

  await db.employee.update({
    where: { id: employeeId },
    data: { failedLoginAttempts: attempts, lockedUntil },
  });
}

export async function registerSuccessfulLogin(employeeId: string): Promise<void> {
  await db.employee.update({
    where: { id: employeeId },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });
}
