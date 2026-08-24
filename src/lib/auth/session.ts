import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { Employee, Role } from "@prisma/client";
import { cookies } from "next/headers";
import { cache } from "react";

import { db } from "@/lib/db";
import { isProduction } from "@/lib/env";

export const SESSION_COOKIE = "entech_session";

/** Hard ceiling: a session dies after this long no matter how active it is. */
const ABSOLUTE_LIFETIME_MS = 12 * 60 * 60 * 1000; // 12 hours
/** Rolling window: a session dies after this long without a request. */
const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
/** Only rewrite lastActiveAt when it is this stale, to avoid a write per request. */
const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export type SessionUser = {
  id: string;
  employeeCode: string;
  fullName: string;
  role: Role;
  department: string | null;
  mustChangePassword: boolean;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function toSessionUser(employee: Employee): SessionUser {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    role: employee.role,
    department: employee.department,
    mustChangePassword: employee.mustChangePassword,
  };
}

/**
 * Issues a fresh session. The raw token is returned to be set as a cookie and is
 * never stored; only its SHA-256 lives in the database.
 */
export async function createSession(
  employeeId: string,
  context: { ipAddress?: string | null; userAgent?: string | null },
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();

  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      employeeId,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent?.slice(0, 512) ?? null,
      expiresAt: new Date(now + ABSOLUTE_LIFETIME_MS),
      idleExpiresAt: new Date(now + IDLE_TIMEOUT_MS),
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: new Date(now + ABSOLUTE_LIFETIME_MS),
  });
}

/**
 * Resolves the current session. Cached per-request so a page and its nested
 * layouts share one database round trip.
 *
 * Returns null for: missing cookie, unknown token, revoked, expired (either
 * clock), or an account that has since been deactivated.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { employee: true },
  });

  if (!session || session.revokedAt) return null;

  const now = new Date();
  if (session.expiresAt <= now || session.idleExpiresAt <= now) {
    await db.session.update({
      where: { id: session.id },
      data: { revokedAt: now },
    });
    return null;
  }

  // Deactivating an employee must lock them out immediately, not at expiry.
  if (!session.employee.isActive) {
    await db.session.updateMany({
      where: { employeeId: session.employeeId, revokedAt: null },
      data: { revokedAt: now },
    });
    return null;
  }

  // Slide the idle window forward, throttled to keep writes off the hot path.
  if (now.getTime() - session.lastActiveAt.getTime() > ACTIVITY_WRITE_INTERVAL_MS) {
    await db.session.update({
      where: { id: session.id },
      data: {
        lastActiveAt: now,
        idleExpiresAt: new Date(
          Math.min(now.getTime() + IDLE_TIMEOUT_MS, session.expiresAt.getTime()),
        ),
      },
    });
  }

  return toSessionUser(session.employee);
});

/** Revokes the caller's session and clears the cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    await db.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  store.delete(SESSION_COOKIE);
}

/** Kills every session for an employee — used on password change and deactivation. */
export async function revokeAllSessions(employeeId: string): Promise<void> {
  await db.session.updateMany({
    where: { employeeId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Constant-time string compare for CSRF tokens and similar secrets. */
export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
