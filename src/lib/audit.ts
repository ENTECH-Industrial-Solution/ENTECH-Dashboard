import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { getRequestContext } from "@/lib/request-context";

/**
 * Append-only audit trail. Nothing in this codebase updates or deletes AuditLog
 * rows — that is deliberate, it is what makes the archive usable as evidence.
 *
 * Pass `tx` to write the audit row inside the same transaction as the mutation
 * it describes, so the two can never diverge.
 */
export type AuditAction =
  | "auth.login.success"
  | "auth.login.failed"
  | "auth.logout"
  | "auth.password.changed"
  | "employee.created"
  | "employee.updated"
  | "employee.deactivated"
  | "employee.reactivated"
  | "employee.password.reset"
  | "employee.role.changed"
  | "task.created"
  | "task.updated"
  | "task.status.changed"
  | "task.completed"
  | "task.reopened";

export async function writeAudit(
  entry: {
    actor: SessionUser | { id: string | null; label: string };
    action: AuditAction;
    entityType: string;
    entityId?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? db;
  const { ipAddress, userAgent } = await getRequestContext();

  const actorId = "employeeCode" in entry.actor ? entry.actor.id : entry.actor.id;
  const actorLabel =
    "employeeCode" in entry.actor
      ? `${entry.actor.employeeCode} — ${entry.actor.fullName}`
      : entry.actor.label;

  await client.auditLog.create({
    data: {
      actorId,
      actorLabel,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata,
      ipAddress,
      userAgent: userAgent?.slice(0, 512) ?? null,
    },
  });
}
