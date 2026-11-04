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

/**
 * The sub-project a task or trip ends up in, given what the form sent and
 * what the record held. A part must belong to the record's project, which the
 * database cannot say across two nullable columns, so it is said here:
 *
 * - `partId` undefined is a form that never sent the field. The part stays —
 *   unless the record is moving to another project, where its old part would
 *   be a branch of somebody else's diagram, so it is dropped.
 * - `partId` null is "no sub-project".
 * - an id must name a part of the project the record will be in.
 *
 * `partId` in the result is what to write; undefined means leave the column.
 */
export async function checkPart(
  { partId, projectId }: { partId?: string | null; projectId?: string | null },
  before: { partId: string | null; projectId: string | null } = { partId: null, projectId: null },
): Promise<{ ok: true; partId: string | null | undefined } | { ok: false; error: ActionState }> {
  const project = projectId === undefined ? before.projectId : projectId;

  if (partId === undefined) {
    const moved = project !== before.projectId && before.partId !== null;
    return { ok: true, partId: moved ? null : undefined };
  }
  if (partId === null) return { ok: true, partId: null };

  const part = await db.projectPart.findUnique({
    where: { id: partId },
    select: { projectId: true },
  });
  if (!part || part.projectId !== project) {
    return {
      ok: false,
      error: {
        status: "error",
        message: "โปรเจกต์ย่อยนี้ไม่อยู่ในโปรเจกต์ที่เลือก / That sub-project is not in the chosen project",
        fieldErrors: { partId: "ไม่พร้อมใช้งาน / Unavailable" },
      },
    };
  }
  return { ok: true, partId };
}
