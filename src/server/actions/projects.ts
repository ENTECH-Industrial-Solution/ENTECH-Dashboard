"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  createProjectSchema,
  formDataToObject,
  moveProjectSchema,
  projectIdSchema,
  updateProjectSchema,
} from "@/lib/validation";

import { diffFields } from "./diff";
import { readImageChange, type ImageChange } from "./pictures";
import { fieldErrorsFrom, runAction, type ActionState } from "./types";

/**
 * Projects are planned by an admin, like the schedule is: every write here is
 * admin-only and audited. Putting a task or trip *into* a project happens on
 * that task's or trip's own form, under that form's own guards.
 *
 * There is no delete. Closing is how a project ends, and it can be undone.
 */

/** Allocates the next PRJ-#### reference atomically, as nextTaskCode does. */
async function nextProjectCode(tx: Prisma.TransactionClient): Promise<string> {
  const counter = await tx.counter.upsert({
    where: { name: "project" },
    create: { name: "project", value: 1 },
    update: { value: { increment: 1 } },
  });
  return `PRJ-${String(counter.value).padStart(4, "0")}`;
}

const EDITABLE_FIELDS = ["name", "scope", "startDate", "endDate"] as const;

function imageData(change: ImageChange) {
  if (change.kind === "set") {
    return { image: change.image, imageType: change.imageType, imageUpdatedAt: new Date() };
  }
  if (change.kind === "remove") return { image: null, imageType: null, imageUpdatedAt: null };
  return {};
}

function revalidateProjectViews(projectId?: string) {
  revalidatePath("/projects");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/admin/tasks");
}

export async function createProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = createProjectSchema.safeParse(formDataToObject(formData));
    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }
    const imageChange = await readImageChange(formData);
    if (imageChange.kind === "error") {
      return { status: "error", message: imageChange.message, fieldErrors: { image: imageChange.message } };
    }

    await db.$transaction(async (tx) => {
      const [code, last] = await Promise.all([
        nextProjectCode(tx),
        tx.project.aggregate({ _max: { position: true } }),
      ]);
      const project = await tx.project.create({
        data: {
          ...parsed.data,
          ...imageData(imageChange),
          code,
          // A new project joins the end of the band; an admin moves it from there.
          position: (last._max.position ?? -1) + 1,
          createdById: admin.id,
        },
        select: { id: true, name: true },
      });
      await writeAudit(
        {
          actor: admin,
          action: "project.created",
          entityType: "Project",
          entityId: project.id,
          metadata: { code, name: project.name, image: imageChange.kind === "set" },
        },
        tx,
      );
    });

    revalidateProjectViews();
    return { status: "success", message: "สร้างโปรเจกต์แล้ว / Project created" };
  });
}

export async function updateProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = updateProjectSchema.safeParse(formDataToObject(formData));
    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const imageChange = await readImageChange(formData);
    if (imageChange.kind === "error") {
      return { status: "error", message: imageChange.message, fieldErrors: { image: imageChange.message } };
    }

    const { projectId, ...data } = parsed.data;
    // Explicit select: the row carries the picture's bytes.
    const before = await db.project.findUnique({
      where: { id: projectId },
      select: {
        code: true,
        name: true,
        scope: true,
        startDate: true,
        endDate: true,
        closedAt: true,
        imageUpdatedAt: true,
      },
    });
    if (!before) return { status: "error", message: "ไม่พบโปรเจกต์ / Project not found" };

    const changes = diffFields(EDITABLE_FIELDS, before, data);
    // The bytes never go into the trail, only that the picture moved.
    const hadImage = before.imageUpdatedAt !== null;
    if (imageChange.kind === "set" || (imageChange.kind === "remove" && hadImage)) {
      changes.image = {
        from: hadImage ? "picture" : null,
        to: imageChange.kind === "set" ? "new picture" : null,
      };
    }
    if (Object.keys(changes).length === 0) return { status: "success" };

    await db.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: projectId },
        data: { ...data, ...imageData(imageChange) },
        select: { id: true },
      });
      await writeAudit(
        {
          actor: admin,
          action: "project.updated",
          entityType: "Project",
          entityId: projectId,
          metadata: { code: before.code, closed: before.closedAt !== null, changes },
        },
        tx,
      );
    });

    revalidateProjectViews(projectId);
    return { status: "success", message: "บันทึกแล้ว / Saved" };
  });
}

/** Close an open project, or reopen a closed one — the button is the same. */
export async function toggleProjectClosedAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = projectIdSchema.safeParse(formDataToObject(formData));
    if (!parsed.success) return { status: "error", message: "ข้อมูลไม่ถูกต้อง / Invalid input" };

    const { projectId } = parsed.data;
    const before = await db.project.findUnique({
      where: { id: projectId },
      select: { code: true, closedAt: true },
    });
    if (!before) return { status: "error", message: "ไม่พบโปรเจกต์ / Project not found" };

    const closing = before.closedAt === null;
    await db.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: projectId },
        data: { closedAt: closing ? new Date() : null },
      });
      await writeAudit(
        {
          actor: admin,
          action: closing ? "project.closed" : "project.reopened",
          entityType: "Project",
          entityId: projectId,
          metadata: { code: before.code },
        },
        tx,
      );
    });

    revalidateProjectViews(projectId);
    return {
      status: "success",
      message: closing ? "ปิดโปรเจกต์แล้ว / Project closed" : "เปิดโปรเจกต์อีกครั้งแล้ว / Project reopened",
    };
  });
}

/**
 * Move an open project one place earlier or later in the band. The open
 * projects are renumbered 0..n-1 with the swap applied, in one statement, so a
 * tie left by two racing creates sorts itself out on the first move.
 */
export async function moveProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = moveProjectSchema.safeParse(formDataToObject(formData));
    if (!parsed.success) return { status: "error", message: "ข้อมูลไม่ถูกต้อง / Invalid input" };

    const { projectId, direction } = parsed.data;
    const open = await db.project.findMany({
      where: { closedAt: null },
      select: { id: true, code: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    const from = open.findIndex((p) => p.id === projectId);
    const to = from + (direction === "up" ? -1 : 1);
    const moving = open[from];
    const other = open[to];
    // Already at that end, or not an open project: nothing to move.
    if (!moving || !other) return { status: "idle" };

    open[from] = other;
    open[to] = moving;
    const values = Prisma.join(open.map((p, i) => Prisma.sql`(${p.id}::text, ${i}::int)`));

    await db.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE app."Project" p SET "position" = v.pos
        FROM (VALUES ${values}) AS v(id, pos)
        WHERE p."id" = v.id
      `;
      await writeAudit(
        {
          actor: admin,
          action: "project.moved",
          entityType: "Project",
          entityId: projectId,
          metadata: { code: moving.code, from, to },
        },
        tx,
      );
    });

    revalidateProjectViews();
    return { status: "success" };
  });
}
