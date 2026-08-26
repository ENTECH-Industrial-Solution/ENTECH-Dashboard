"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { assertAdmin } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { SETTINGS_CACHE_TAG } from "@/lib/settings/server";
import { formDataToObject, settingSchema } from "@/lib/validation";

import { fieldErrorsFrom, runAction, type ActionState } from "./types";

/**
 * Flip one UI switch. Admin-only and audited, like every other admin action —
 * turning off the shared completed archive changes what employees can read, so
 * it is not a preference, it is a decision worth a record.
 */
export async function setSettingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const admin = await assertAdmin();
    const parsed = settingSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const { key, enabled } = parsed.data;

    await db.$transaction(async (tx) => {
      await tx.appSetting.upsert({
        where: { key },
        create: { key, enabled },
        update: { enabled },
      });

      await writeAudit(
        {
          actor: admin,
          action: "settings.changed",
          entityType: "AppSetting",
          entityId: key,
          metadata: { key, enabled },
        },
        tx,
      );
    });

    // The switches are cached across requests, so the rendered pages are not
    // the only thing to invalidate — drop the cached AppSetting read first, or
    // a re-rendered page would just read the stale value back. This matters
    // beyond freshness: dashboard.sharedHistory decides what the query layer
    // will select, so a missed invalidation would leave the archive open.
    revalidateTag(SETTINGS_CACHE_TAG);

    // Settings reach into every page, including the layout-level nav.
    revalidatePath("/", "layout");
    return { status: "success", message: "บันทึกการตั้งค่าแล้ว / Settings saved" };
  });
}
