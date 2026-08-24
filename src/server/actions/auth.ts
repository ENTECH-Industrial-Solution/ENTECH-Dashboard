"use server";

import { redirect } from "next/navigation";

import { assertUser } from "@/lib/auth/rbac";
import {
  checkLockout,
  registerFailedLogin,
  registerSuccessfulLogin,
} from "@/lib/auth/login-throttle";
import {
  fakeVerify,
  hashPassword,
  verifyPassword,
} from "@/lib/auth/password";
import {
  createSession,
  destroySession,
  revokeAllSessions,
} from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestContext } from "@/lib/request-context";
import {
  changePasswordSchema,
  formDataToObject,
  loginSchema,
} from "@/lib/validation";

import { fieldErrorsFrom, runAction, type ActionState } from "./types";

/** 10 attempts per IP per 10 minutes, on top of the per-account lockout. */
const LOGIN_IP_LIMIT = 10;
const LOGIN_IP_WINDOW_MS = 10 * 60 * 1000;

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { ipAddress, userAgent } = await getRequestContext();

    const limit = rateLimit(
      `login:${ipAddress ?? "unknown"}`,
      LOGIN_IP_LIMIT,
      LOGIN_IP_WINDOW_MS,
    );
    if (!limit.allowed) {
      return {
        status: "error",
        message: "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่ภายหลัง / Too many attempts",
      };
    }

    const parsed = loginSchema.safeParse(formDataToObject(formData));
    if (!parsed.success) {
      // Same message as a wrong password — do not tell an attacker which field
      // failed, or that a well-formed code is required.
      return { status: "error", message: INVALID_CREDENTIALS };
    }

    const { employeeCode, password } = parsed.data;
    const employee = await db.employee.findUnique({ where: { employeeCode } });

    if (!employee) {
      // Spend comparable CPU so response time does not reveal that the code is unknown.
      await fakeVerify();
      return { status: "error", message: INVALID_CREDENTIALS };
    }

    const lockout = checkLockout(employee);
    if (lockout.locked) {
      await fakeVerify();
      return {
        status: "error",
        message:
          "บัญชีถูกล็อกชั่วคราวจากการพยายามเข้าสู่ระบบผิดหลายครั้ง / Account temporarily locked",
      };
    }

    const valid = await verifyPassword(employee.passwordHash, password);

    if (!valid) {
      await registerFailedLogin(employee.id);
      await writeAudit({
        actor: { id: employee.id, label: `${employee.employeeCode} — ${employee.fullName}` },
        action: "auth.login.failed",
        entityType: "Employee",
        entityId: employee.id,
      });
      return { status: "error", message: INVALID_CREDENTIALS };
    }

    // Check active status only after the password verifies, so a deactivated
    // account is indistinguishable from a wrong password to an outsider.
    if (!employee.isActive) {
      return {
        status: "error",
        message: "บัญชีนี้ถูกระงับการใช้งาน / This account is deactivated",
      };
    }

    await registerSuccessfulLogin(employee.id);
    await createSession(employee.id, { ipAddress, userAgent });
    await writeAudit({
      actor: {
        id: employee.id,
        label: `${employee.employeeCode} — ${employee.fullName}`,
      },
      action: "auth.login.success",
      entityType: "Employee",
      entityId: employee.id,
    });

    redirect(employee.mustChangePassword ? "/change-password" : "/dashboard");
  });
}

const INVALID_CREDENTIALS =
  "รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง / Invalid employee code or password";

export async function logoutAction(): Promise<void> {
  const user = await assertUser().catch(() => null);
  if (user) {
    await writeAudit({
      actor: user,
      action: "auth.logout",
      entityType: "Employee",
      entityId: user.id,
    });
  }
  await destroySession();
  redirect("/login");
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await assertUser();
    const parsed = changePasswordSchema.safeParse(formDataToObject(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "ข้อมูลไม่ถูกต้อง / Invalid input",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    const employee = await db.employee.findUnique({ where: { id: user.id } });
    if (!employee) throw new Error("session refers to a missing employee");

    const valid = await verifyPassword(
      employee.passwordHash,
      parsed.data.currentPassword,
    );
    if (!valid) {
      return {
        status: "error",
        message: "รหัสผ่านปัจจุบันไม่ถูกต้อง / Current password is incorrect",
        fieldErrors: {
          currentPassword: "รหัสผ่านปัจจุบันไม่ถูกต้อง / Incorrect password",
        },
      };
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);

    await db.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
        },
      });
      await writeAudit(
        { actor: user, action: "auth.password.changed", entityType: "Employee", entityId: user.id },
        tx,
      );
    });

    // Changing a password invalidates every session, including this one, so a
    // stolen cookie cannot survive the change that was meant to stop it.
    await revokeAllSessions(user.id);
    await destroySession();

    redirect("/login?changed=1");
  });
}
