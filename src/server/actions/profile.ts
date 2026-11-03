"use server";

import { revalidatePath } from "next/cache";

import { assertUser } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";

import { readImageChange } from "./pictures";
import { runAction, type ActionState } from "./types";

/**
 * Your own profile picture — set or removed by you, for you.
 *
 * Whose picture it is comes from the session and never from the form, so
 * there is no id here to guess at. The audit row says that it changed and
 * nothing about the bytes.
 */
export async function setOwnPhotoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertUser();
    const change = await readImageChange(formData);
    if (change.kind === "error") {
      return { status: "error", message: change.message, fieldErrors: { image: change.message } };
    }
    if (change.kind === "keep") return { status: "success" };

    await db.$transaction(async (tx) => {
      if (change.kind === "set") {
        const picture = { image: change.image, imageType: change.imageType };
        await tx.employeePhoto.upsert({
          where: { employeeId: user.id },
          create: { employeeId: user.id, ...picture },
          update: picture,
          select: { employeeId: true },
        });
      } else {
        await tx.employeePhoto.deleteMany({ where: { employeeId: user.id } });
      }
      await writeAudit(
        {
          actor: user,
          action: "employee.photo.changed",
          entityType: "Employee",
          entityId: user.id,
          metadata: { employeeCode: user.employeeCode, removed: change.kind === "remove" },
        },
        tx,
      );
    });

    // A face is drawn on most pages, the header's included.
    revalidatePath("/", "layout");
    return { status: "success", message: "บันทึกรูปแล้ว / Picture saved" };
  });
}
