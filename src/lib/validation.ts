import { z } from "zod";

import { passwordSchema } from "@/lib/auth/password";
import { isSettingKey } from "@/lib/settings/settings";

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

/**
 * FormData carries no key at all for a control that was never rendered — a
 * status note the card does not ask for, a field a UI switch has hidden. A
 * missing value therefore has to mean exactly what an empty one means: not
 * set. That is why every optional field below is `.nullish()` rather than
 * `.nullable()` — the latter accepts an empty value but rejects an absent key.
 */
const isBlank = (v: string | null | undefined): v is "" | null | undefined =>
  v === undefined || v === null || v === "";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (isBlank(v) ? null : v));

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
    .nullish()
    .transform((v) => (isBlank(v) ? null : v)),
  department: optionalText(80),
  position: optionalText(80),
  role: z.enum(["ADMIN", "EMPLOYEE"]).default("EMPLOYEE"),
});

export const updateEmployeeSchema = createEmployeeSchema
  .omit({ employeeCode: true })
  .extend({ employeeId: z.string().cuid() });

export const employeeIdSchema = z.object({ employeeId: z.string().cuid() });

/** An optional <input type="date"> value: "" means "not set". */
const optionalDate = z
  .union([z.string().trim(), z.literal("")])
  .nullish()
  .transform((v) => (isBlank(v) ? null : new Date(v)))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), {
    message: "วันที่ไม่ถูกต้อง / Invalid date",
  });

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1, "กรุณากรอกชื่องาน / Title is required").max(200),
    description: optionalText(5000),
    assigneeId: z.string().cuid(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
    /// Planned schedule. Both ends are optional, but if both are given the
    /// start cannot fall after the end.
    startDate: optionalDate,
    dueDate: optionalDate,
  })
  .refine((d) => !d.startDate || !d.dueDate || d.startDate <= d.dueDate, {
    message: "วันเริ่มงานต้องไม่เกินกำหนดส่ง / Start date cannot be after the due date",
    path: ["startDate"],
  });

/** A required <input type="date"> value. */
const requiredDate = z
  .string()
  .trim()
  .min(1, "กรุณาระบุวันที่ / A date is required")
  .transform((v) => new Date(v))
  .refine((d) => !Number.isNaN(d.getTime()), {
    message: "วันที่ไม่ถูกต้อง / Invalid date",
  });

const optionalCoordinate = (limit: number) =>
  z
    .union([z.string().trim(), z.literal("")])
    .nullish()
    .transform((v) => (isBlank(v) ? null : Number(v)))
    .refine((n) => n === null || (Number.isFinite(n) && Math.abs(n) <= limit), {
      message: `พิกัดไม่ถูกต้อง / Coordinate must be between -${limit} and ${limit}`,
    });

/**
 * A pasted Google Maps link. Restricted to Google's own hosts: this value is
 * rendered as a link people are invited to click, so an arbitrary URL here
 * would turn the trip form into a way to plant one.
 */
const GOOGLE_MAPS_HOST = /^((www|maps)\.)?google\.(com|co\.[a-z]{2}|[a-z]{2,3})$/;

const googleMapsUrl = z
  .union([z.string().trim(), z.literal("")])
  .nullish()
  .transform((v) => (isBlank(v) ? null : v))
  .refine(
    (v) => {
      if (v === null) return true;
      try {
        const url = new URL(v);
        if (url.protocol !== "https:") return false;
        return (
          GOOGLE_MAPS_HOST.test(url.hostname) ||
          url.hostname === "maps.app.goo.gl" ||
          url.hostname === "goo.gl"
        );
      } catch {
        return false;
      }
    },
    { message: "ต้องเป็นลิงก์ Google Maps เท่านั้น / Must be a Google Maps link" },
  );

const fieldTripFields = z.object({
  employeeId: z.string().cuid(),
  purpose: z
    .string()
    .trim()
    .min(1, "กรุณาระบุเรื่องที่ไป / A purpose is required")
    .max(200),
  locationName: z
    .string()
    .trim()
    .min(1, "กรุณาระบุสถานที่ / A location is required")
    .max(200),
  address: optionalText(300),
  latitude: optionalCoordinate(90),
  longitude: optionalCoordinate(180),
  mapUrl: googleMapsUrl,
  startDate: requiredDate,
  endDate: requiredDate,
  note: optionalText(2000),
});

type FieldTripInput = z.infer<typeof fieldTripFields>;

const endsAfterItStarts = (d: FieldTripInput) => d.startDate <= d.endDate;
/** Half a coordinate pin is not a location — require both or neither. */
const coordinatesArePaired = (d: FieldTripInput) =>
  (d.latitude === null) === (d.longitude === null);

export const createFieldTripSchema = fieldTripFields
  .refine(endsAfterItStarts, {
    message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม / The end date cannot precede the start",
    path: ["endDate"],
  })
  .refine(coordinatesArePaired, {
    message: "ต้องกรอกทั้งละติจูดและลองจิจูด / Enter both latitude and longitude",
    path: ["longitude"],
  });

export const updateFieldTripSchema = fieldTripFields
  .extend({ fieldTripId: z.string().cuid() })
  .refine(endsAfterItStarts, {
    message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม / The end date cannot precede the start",
    path: ["endDate"],
  })
  .refine(coordinatesArePaired, {
    message: "ต้องกรอกทั้งละติจูดและลองจิจูด / Enter both latitude and longitude",
    path: ["longitude"],
  });

export const cancelFieldTripSchema = z.object({
  fieldTripId: z.string().cuid(),
  reason: z
    .string()
    .trim()
    .min(1, "กรุณาระบุเหตุผล / A reason is required")
    .max(500),
});

/** One UI switch on the admin settings page. */
export const settingSchema = z.object({
  key: z.string().refine(isSettingKey, "ไม่รู้จักการตั้งค่านี้ / Unknown setting"),
  enabled: z.enum(["true", "false"]).transform((v) => v === "true"),
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
    .nullish()
    .transform((v) => (isBlank(v) ? null : v)),
});

export const reopenTaskSchema = z.object({
  taskId: z.string().cuid(),
  reason: z
    .string()
    .trim()
    .min(1, "กรุณาระบุเหตุผล / A reason is required")
    .max(1000),
});

/**
 * Opening a capsule in the summary strip. A read rather than a mutation, and
 * the arguments still arrive from the browser, so they are parsed here like
 * everything else. Widening is not a concern the schema has to cover —
 * `assigneeScope()` discards this id for a non-admin — but the shape is.
 */
export const workloadTasksSchema = z.object({
  assigneeId: z.string().cuid(),
  metric: z.enum(["active", "overdue", "completed"]),
});

/** Narrow FormData to a plain object before Zod sees it. */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") obj[key] = value;
  }
  return obj;
}
