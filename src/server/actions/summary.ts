"use server";

import { assertUser } from "@/lib/auth/rbac";
import { AuthorizationError } from "@/lib/errors";
import { workloadTasksSchema } from "@/lib/validation";
import { getWorkloadTasks } from "@/server/queries";
import type { WorkloadTaskRow } from "@/components/workload-pills";

/**
 * The one read that happens after the page has rendered: the work behind a
 * capsule in the summary strip — tasks and field trips alike — fetched when
 * someone opens it.
 *
 * A read, not a mutation, so it does not go through `runAction` — there is no
 * FormData, no field-level failure to report, and nothing to revalidate. What
 * it keeps from that contract is the part that matters: it never throws across
 * the boundary, so an unexpected error reaches the browser as a message rather
 * than a stack trace.
 *
 * Authorization is unchanged. `assertUser()` gates it and `getWorkloadTasks()`
 * narrows by the caller through `assigneeScope()`, which discards the supplied
 * id for a non-admin — so the id in this payload can only ever select rows the
 * caller could already read.
 */
export type WorkloadTasksResult =
  | { status: "ok"; tasks: WorkloadTaskRow[] }
  | { status: "error"; message: string };

export async function loadWorkloadTasksAction(
  input: unknown,
): Promise<WorkloadTasksResult> {
  try {
    const user = await assertUser();
    const parsed = workloadTasksSchema.safeParse(input);

    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
      };
    }

    const tasks = await getWorkloadTasks(user, parsed.data);

    // Dates cannot cross into a client component as Date instances.
    return {
      status: "ok",
      tasks: tasks.map((task) => ({
        id: task.id,
        kind: task.kind,
        code: task.code,
        title: task.title,
        status: task.status,
        dueDate: task.dueDate?.toISOString() ?? null,
        completedAt: task.completedAt?.toISOString() ?? null,
      })),
    };
  } catch (error) {
    // Same split as runAction: an authorization failure is an answer, not a
    // fault, so it reports its own message and does not pollute the log.
    if (error instanceof AuthorizationError) {
      return { status: "error", message: error.message };
    }

    console.error("[action] loadWorkloadTasks failed", error);
    return {
      status: "error",
      message: "โหลดรายการไม่สำเร็จ / Could not load the list",
    };
  }
}
