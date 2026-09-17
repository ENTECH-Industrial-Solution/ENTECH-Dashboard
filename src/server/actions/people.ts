import "server-only";

import { db } from "@/lib/db";

import type { ActionState } from "./types";

/**
 * Every id in a people list must name an active account, or the write is
 * refused with a sentence rather than a foreign-key error.
 *
 * Shared by the task and trip actions, because both carry a list of equals
 * (TaskAssignee, FieldTripTraveller) and both would otherwise strand work on
 * a suspended account nobody can sign in to reach. The caller names the form
 * field and the verb so the error lands on the right input, in its words.
 */
export async function checkPeople(
  employeeIds: string[],
  { field, message }: { field: string; message: string },
): Promise<
  { ok: true; codes: string[] } | { ok: false; error: ActionState }
> {
  const found = await db.employee.findMany({
    where: { id: { in: employeeIds } },
    select: { isActive: true, employeeCode: true },
  });

  const inactive = found
    .filter((employee) => !employee.isActive)
    .map((employee) => employee.employeeCode)
    .sort();

  // Short by any amount means an id matched nothing at all. There is no code to
  // name for those, so the count is what the message can offer.
  const missing = employeeIds.length - found.length;

  if (inactive.length > 0 || missing > 0) {
    const named = inactive.length > 0 ? `: ${inactive.join(", ")}` : "";
    return {
      ok: false,
      error: {
        status: "error",
        message: `${message}${named}`,
        fieldErrors: { [field]: "ไม่พร้อมใช้งาน / Unavailable" },
      },
    };
  }

  return {
    ok: true,
    codes: found.map((employee) => employee.employeeCode).sort(),
  };
}

/**
 * The difference between the people on a record and the people a form sent,
 * as sets — the ids arrive in whatever order a picker produced them, and
 * reordering the same three people is not an edit. Disjoint by construction,
 * so a Prisma `deleteMany` + `createMany` can run in either order.
 */
export function peopleDelta(
  beforeIds: readonly string[],
  afterIds: readonly string[],
): { added: string[]; removed: string[]; changed: boolean } {
  const added = afterIds.filter((id) => !beforeIds.includes(id));
  const removed = beforeIds.filter((id) => !afterIds.includes(id));
  return { added, removed, changed: added.length > 0 || removed.length > 0 };
}
