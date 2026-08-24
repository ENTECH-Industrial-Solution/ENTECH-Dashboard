import { z } from "zod";

import { passwordSchema } from "@/lib/auth/password";

/**
 * Every server action parses its FormData through one of these schemas before
 * touching the database. Nothing downstream re-checks shape or length, so this
 * file is the single place where untrusted input becomes typed data.
 */

/** Employee codes are uppercase alphanumeric with dashes: ENT-0042. */
export const employeeCodeSchema = z
  .string()
  .trim()
  .min(3, "รหัสพนักงานสั้นเกินไป / Employee code is too short")
  .max(32, "รหัสพนักงานยาวเกินไป / Employee code is too long")
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9-]*$/,
    "ใช้ได้เฉพาะตัวอักษร ตัวเลข และขีดกลาง / Letters, digits, and dashes only",
  )
  .transform((v) => v.toUpperCase());

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable();

export const loginSchema = z.object({
  employeeCode: employeeCodeSchema,
  // Deliberately not passwordSchema: existing passwords must not be rejected by
  // a future policy change, and echoing policy rules on the login form leaks them.
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "รหัสผ่านไม่ตรงกัน / Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "รหัสผ่านใหม่ต้องต่างจากเดิม / New password must differ from the current one",
    path: ["newPassword"],
  });

export const createEmployeeSchema = z.object({
  employeeCode: employeeCodeSchema,
  fullName: z.string().trim().min(1, "กรุณากรอกชื่อ / Name is required").max(120),
  email: z
    .union([z.string().trim().email(), z.literal("")])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  department: optionalText(80),
  position: optionalText(80),
  role: z.enum(["ADMIN", "EMPLOYEE"]).default("EMPLOYEE"),
});

export const updateEmployeeSchema = createEmployeeSchema
  .omit({ employeeCode: true })
  .extend({ employeeId: z.string().cuid() });

export const employeeIdSchema = z.object({ employeeId: z.string().cuid() });

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "กรุณากรอกชื่องาน / Title is required").max(200),
  description: optionalText(5000),
  assigneeId: z.string().cuid(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  dueDate: z
    .union([z.string().trim(), z.literal("")])
    .transform((v) => (v === "" ? null : new Date(v)))
    .nullable()
    .refine((d) => d === null || !Number.isNaN(d.getTime()), {
      message: "วันที่ไม่ถูกต้อง / Invalid date",
    }),
});

export const updateTaskStatusSchema = z.object({
  taskId: z.string().cuid(),
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED"]),
  note: optionalText(1000),
});

export const completeTaskSchema = z.object({
  taskId: z.string().cuid(),
  completionNote: z
    .string()
    .trim()
    .min(1, "กรุณาสรุปผลงานเพื่อเก็บเป็นหลักฐาน / A completion note is required as evidence")
    .max(5000),
  proofUrl: z
    .union([z.string().trim().url(), z.literal("")])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
});

export const reopenTaskSchema = z.object({
  taskId: z.string().cuid(),
  reason: z
    .string()
    .trim()
    .min(1, "กรุณาระบุเหตุผล / A reason is required")
    .max(1000),
});

/** Narrow FormData to a plain object before Zod sees it. */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") obj[key] = value;
  }
  return obj;
}
