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
  /// A rename of the login identifier itself, kept apart from
  /// employee.updated because "who is ENT-0002 now" is a question someone
  /// reading the trail backwards has to be able to answer.
  | "employee.code.changed"
  /// The third and last action that destroys its row. Only ever reachable for
  /// an account that is already deactivated and that no task, trip, or event
  /// still points at — the snapshot in its metadata is what survives, minus
  /// the password hash, which is never copied anywhere.
  | "employee.deleted"
  | "task.created"
  | "task.updated"
  | "task.status.changed"
  | "task.completed"
  | "task.reopened"
  /// The only action in this list that destroys the row it describes. Its
  /// metadata carries a full snapshot of the task and its event trail, because
  /// after it runs this row is the only record that either ever existed.
  | "task.deleted"
  | "fieldTrip.created"
  | "fieldTrip.updated"
  | "fieldTrip.started"
  | "fieldTrip.completed"
  | "fieldTrip.cancelled"
  /// Destroys its row, exactly like task.deleted. Same rule: the metadata is a
  /// full snapshot, because nothing else will be left to describe the trip.
  | "fieldTrip.deleted"
  | "customerPin.created"
  | "customerPin.updated"
  | "customerPin.moved"
  /// Destroys its row *and* every customer standing at it — the only cascade in
  /// the schema. Its metadata carries the pin and a full copy of each customer,
  /// because after it runs nothing else describes any of them.
  | "customerPin.deleted"
  | "customer.created"
  | "customer.updated"
  /// Kept apart from customer.updated on purpose: "who was moved from ลังเล to
  /// สนใจ, and when" is the question this whole feature is asked, and it should
  /// be answerable without unpacking a diff.
  | "customer.status.changed"
  | "customer.deleted"
  | "settings.changed";

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
