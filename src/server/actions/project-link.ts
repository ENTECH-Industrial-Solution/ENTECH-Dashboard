import "server-only";

import { db } from "@/lib/db";

import type { ActionState } from "./types";

/**
 * The project a task or trip is being put in must exist and be open, or the
 * write is refused with a sentence on the picker rather than a foreign-key
 * error. `current` is the project the record is already in: leaving work
 * where it is stays legal after that project closes, so an unrelated edit to a
 * task in a finished job does not fail.
 *
 * `undefined` is an edit form that never sent the field — nothing to check.
 */
export async function checkProject(
  projectId: string | null | undefined,
  current: string | null = null,
): Promise<
  { ok: true; code: string | null } | { ok: false; error: ActionState }
> {
  if (!projectId) return { ok: true, code: null };

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { code: true, closedAt: true },
  });

  if (!project || (project.closedAt !== null && projectId !== current)) {
    return {
      ok: false,
      error: {
        status: "error",
        message: "โปรเจกต์นี้ไม่มีอยู่หรือปิดไปแล้ว / That project is missing or closed",
        fieldErrors: { projectId: "ไม่พร้อมใช้งาน / Unavailable" },
      },
    };
  }

  return { ok: true, code: project.code };
}
