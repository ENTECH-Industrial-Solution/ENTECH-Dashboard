"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  createPartSchema,
  createProjectSchema,
  formDataToObject,
  movePartSchema,
  moveProjectSchema,
  partIdSchema,
  projectIdSchema,
  renamePartSchema,
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
 * Sub-projects (ProjectPart) are the exception: a grouping rather than a
 * record, so an admin may delete one, which only ungroups its work.
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

/**
 * Whether `parentId` may hold the part `partId` (null for one being created):
 * it must be a part of the same project, and neither the part itself nor
 * anything inside it, which would make a loop. The database can say neither.
 * Returns the project's part names for the audit row, or the refusal.
 */
async function checkParent(
  projectId: string,
  parentId: string | null,
  partId: string | null,
): Promise<{ ok: true; names: Map<string, string> } | { ok: false; error: ActionState }> {
  const parts = await db.projectPart.findMany({
    where: { projectId },
    select: { id: true, name: true, parentId: true },
  });
  const names = new Map(parts.map((p) => [p.id, p.name]));
  if (parentId === null) return { ok: true, names };

  const refuse = (message: string) =>
    ({ ok: false, error: { status: "error", message, fieldErrors: { parentId: message } } }) as const;
  if (!names.has(parentId)) {
    return refuse("โปรเจกต์ย่อยนี้ไม่อยู่ในโปรเจกต์เดียวกัน / That sub-project is not in this project");
  }
  const up = new Map(parts.map((p) => [p.id, p.parentId]));
  // Bounded by the part count, so a loop already in the data cannot hang this.
  let at: string | null | undefined = parentId;
  for (let step = 0; at && step <= parts.length; step++, at = up.get(at)) {
    if (at === partId) {
      return refuse("ย้ายโปรเจกต์ย่อยเข้าไปในตัวเองไม่ได้ / A sub-project cannot go inside itself");
    }
  }
  return { ok: true, names };
}

/** Add a sub-project to a project — or inside another one — at the end of its order. */
export async function createPartAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = createPartSchema.safeParse(formDataToObject(formData));
    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const { projectId, name, parentId } = parsed.data;
    const [project, parent] = await Promise.all([
      db.project.findUnique({
        where: { id: projectId },
        select: { code: true, closedAt: true },
      }),
      checkParent(projectId, parentId, null),
    ]);
    if (!project || project.closedAt) {
      return { status: "error", message: "โปรเจกต์นี้ไม่มีอยู่หรือปิดไปแล้ว / That project is missing or closed" };
    }
    if (!parent.ok) return parent.error;

    await db.$transaction(async (tx) => {
      const last = await tx.projectPart.aggregate({
        where: { projectId },
        _max: { position: true },
      });
      const part = await tx.projectPart.create({
        // One made inside another is placed; one made on its own floats until
        // somebody draws its line on the map.
        data: {
          projectId,
          parentId,
          floating: parentId === null,
          name,
          position: (last._max.position ?? -1) + 1,
        },
        select: { id: true },
      });
      await writeAudit(
        {
          actor: admin,
          action: "project.part.created",
          entityType: "ProjectPart",
          entityId: part.id,
          metadata: {
            project: project.code,
            name,
            parent: parentId ? (parent.names.get(parentId) ?? null) : null,
          },
        },
        tx,
      );
    });

    revalidateProjectViews(projectId);
    return { status: "success", message: "เพิ่มโปรเจกต์ย่อยแล้ว / Sub-project added" };
  });
}

export async function renamePartAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = renamePartSchema.safeParse(formDataToObject(formData));
    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const { partId, name } = parsed.data;
    const before = await db.projectPart.findUnique({
      where: { id: partId },
      select: { name: true, projectId: true, project: { select: { code: true } } },
    });
    if (!before) return { status: "error", message: "ไม่พบโปรเจกต์ย่อย / Sub-project not found" };
    if (before.name === name) return { status: "success" };

    await db.$transaction(async (tx) => {
      await tx.projectPart.update({ where: { id: partId }, data: { name } });
      await writeAudit(
        {
          actor: admin,
          action: "project.part.renamed",
          entityType: "ProjectPart",
          entityId: partId,
          metadata: { project: before.project.code, changes: { name: { from: before.name, to: name } } },
        },
        tx,
      );
    });

    revalidateProjectViews(before.projectId);
    return { status: "success", message: "บันทึกแล้ว / Saved" };
  });
}

/**
 * Move a sub-project inside another one of the same project, up to the
 * project itself, or off the map's lines altogether (floating). Its work and
 * its own sub-projects go with it. Refused in a closed project, as adding one is.
 */
export async function movePartAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = movePartSchema.safeParse(formDataToObject(formData));
    if (!parsed.success) return { status: "error", message: "ข้อมูลไม่ถูกต้อง / Invalid input" };

    const { partId, to } = parsed.data;
    const parentId = to === "root" || to === "loose" ? null : to;
    const floating = to === "loose";
    const before = await db.projectPart.findUnique({
      where: { id: partId },
      select: {
        name: true,
        parentId: true,
        floating: true,
        projectId: true,
        project: { select: { code: true, closedAt: true } },
      },
    });
    if (!before) return { status: "error", message: "ไม่พบโปรเจกต์ย่อย / Sub-project not found" };
    if (before.project.closedAt) {
      return { status: "error", message: "โปรเจกต์นี้ปิดไปแล้ว / That project is closed" };
    }
    if (before.parentId === parentId && before.floating === floating) return { status: "success" };

    const parent = await checkParent(before.projectId, parentId, partId);
    if (!parent.ok) return parent.error;
    const nameOf = (id: string | null) => (id ? (parent.names.get(id) ?? null) : null);

    await db.$transaction(async (tx) => {
      await tx.projectPart.update({ where: { id: partId }, data: { parentId, floating } });
      await writeAudit(
        {
          actor: admin,
          action: "project.part.moved",
          entityType: "ProjectPart",
          entityId: partId,
          metadata: {
            project: before.project.code,
            name: before.name,
            changes: {
              parent: { from: nameOf(before.parentId), to: nameOf(parentId) },
              ...(before.floating !== floating && {
                floating: { from: before.floating, to: floating },
              }),
            },
          },
        },
        tx,
      );
    });

    revalidateProjectViews(before.projectId);
    return { status: "success", message: "ย้ายแล้ว / Moved" };
  });
}

/**
 * Remove a sub-project. Its tasks and trips stay in the project and only lose
 * the grouping (SetNull); the audit row names every one of them, because after
 * this runs nothing else records which branch they were on. Sub-projects
 * inside it move up to its own parent, so one level comes out of the tree
 * rather than the whole branch flattening onto the project.
 */
export async function deletePartAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = partIdSchema.safeParse(formDataToObject(formData));
    if (!parsed.success) return { status: "error", message: "ข้อมูลไม่ถูกต้อง / Invalid input" };

    const { partId } = parsed.data;
    const part = await db.projectPart.findUnique({
      where: { id: partId },
      select: {
        name: true,
        parentId: true,
        floating: true,
        projectId: true,
        project: { select: { code: true } },
        tasks: { select: { code: true } },
        trips: { select: { id: true, purpose: true } },
        children: { select: { name: true } },
      },
    });
    if (!part) return { status: "error", message: "ไม่พบโปรเจกต์ย่อย / Sub-project not found" };

    await db.$transaction(async (tx) => {
      if (part.children.length > 0) {
        await tx.projectPart.updateMany({
          where: { parentId: partId },
          // Out of a floating part they float too, rather than suddenly
          // gaining a line to the project nobody drew.
          data: { parentId: part.parentId, floating: part.floating },
        });
      }
      await writeAudit(
        {
          actor: admin,
          action: "project.part.deleted",
          entityType: "ProjectPart",
          entityId: partId,
          metadata: {
            project: part.project.code,
            name: part.name,
            tasks: part.tasks.map((task) => task.code),
            trips: part.trips.map((trip) => ({ id: trip.id, purpose: trip.purpose })),
            liftedParts: part.children.map((child) => child.name),
          },
        },
        tx,
      );
      await tx.projectPart.delete({ where: { id: partId } });
    });

    revalidateProjectViews(part.projectId);
    return { status: "success", message: "ลบโปรเจกต์ย่อยแล้ว / Sub-project deleted" };
  });
}
