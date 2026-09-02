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

/** An optional link. A missing key and an empty value both mean "no link". */
const optionalUrl = z
  .union([z.string().trim().url(), z.literal("")])
  .nullish()
  .transform((v) => (isBlank(v) ? null : v));

/**
 * The edit-form counterparts, and the one place this file departs from the rule
 * above — deliberately, because an edit form is not a create form.
 *
 * A create form has nothing to preserve, so an absent key can safely mean "not
 * set". An edit form renders some fields only when they apply, and a key it
 * never rendered has not been *cleared* — it has not been *touched*. Reading
 * absence as null there would wipe the completion record that
 * `reopenTaskAction` goes out of its way to keep.
 *
 * So absent yields `undefined`, which Prisma takes as "leave this column
 * alone", while an empty value from a field that *was* rendered still clears.
 */
const untouchedOrText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v));

const untouchedOrUrl = z
  .union([z.string().trim().url(), z.literal("")])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "" ? null : v));

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

/**
 * Editing an account, employee code included.
 *
 * The code was held back from this schema for a while, on the grounds that it
 * is the login identifier and renaming it renames someone's way in. It is
 * editable now because the alternative was worse: a code typed wrong at
 * creation could only be fixed by deactivating the account and making another,
 * which scatters one person's history across two rows. The session survives a
 * rename — it is bound to the row's id, not its code — so what changes is what
 * the person types at the login form, and the action says so in its result.
 */
export const updateEmployeeSchema = createEmployeeSchema.extend({
  employeeId: z.string().cuid(),
});

export const employeeIdSchema = z.object({ employeeId: z.string().cuid() });

/**
 * Deleting an account for good.
 *
 * The reason is required on the same terms as deleteTaskSchema: once the row is
 * gone the audit entry is the only thing that can say why, and "an admin
 * deleted ENT-0002" on its own answers nothing.
 */
export const deleteEmployeeSchema = z.object({
  employeeId: z.string().cuid(),
  reason: z
    .string()
    .trim()
    .min(1, "กรุณาระบุเหตุผลในการลบ / A reason is required to delete")
    .max(1000),
});

/** An optional <input type="date"> value: "" means "not set". */
const optionalDate = z
  .union([z.string().trim(), z.literal("")])
  .nullish()
  .transform((v) => (isBlank(v) ? null : new Date(v)))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), {
    message: "วันที่ไม่ถูกต้อง / Invalid date",
  });

const taskFields = z.object({
  title: z.string().trim().min(1, "กรุณากรอกชื่องาน / Title is required").max(200),
  description: optionalText(5000),
  assigneeId: z.string().cuid(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  /// Planned schedule. Both ends are optional, but if both are given the
  /// start cannot fall after the end.
  startDate: optionalDate,
  dueDate: optionalDate,
});

const scheduleIsOrdered = (d: z.infer<typeof taskFields>) =>
  !d.startDate || !d.dueDate || d.startDate <= d.dueDate;

const SCHEDULE_ORDER = {
  message: "วันเริ่มงานต้องไม่เกินกำหนดส่ง / Start date cannot be after the due date",
  path: ["startDate"],
};

export const createTaskSchema = taskFields.refine(scheduleIsOrdered, SCHEDULE_ORDER);

/**
 * Editing a task after it exists — every field that is content rather than
 * record. What is *not* here is as deliberate as what is: `code` is the task's
 * identity, `status` has its own action with its own transitions, and
 * `createdAt`/`startedAt`/`completedAt` are timestamps the system wrote about
 * things that happened. Those are not data to correct, they are the record.
 *
 * The completion pair is editable because an archived task is now editable at
 * all (see updateTaskAction) — and because a note with a typo in it is worse
 * evidence than a corrected one, provided the correction is itself recorded.
 */
export const updateTaskSchema = taskFields
  .extend({
    taskId: z.string().cuid(),
    completionNote: untouchedOrText(5000),
    proofUrl: untouchedOrUrl,
  })
  .refine(scheduleIsOrdered, SCHEDULE_ORDER);

/** A required <input type="date"> value. */
const requiredDate = z
  .string()
  .trim()
  .min(1, "กรุณาระบุวันที่ / A date is required")
  .transform((v) => new Date(v))
  .refine((d) => !Number.isNaN(d.getTime()), {
    message: "วันที่ไม่ถูกต้อง / Invalid date",
  });

/**
 * An optional <input type="time"> value: 24-hour "HH:MM", blank meaning "not
 * said" rather than midnight — the office hours in lib/calendar.ts fill in.
 */
const optionalTime = z
  .union([z.string().trim(), z.literal("")])
  .nullish()
  .transform((v) => (isBlank(v) ? null : v))
  .refine((v) => v === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), {
    message: "เวลาไม่ถูกต้อง / Invalid time",
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
  startTime: optionalTime,
  endTime: optionalTime,
  note: optionalText(2000),
});

type FieldTripInput = z.infer<typeof fieldTripFields>;

const endsAfterItStarts = (d: FieldTripInput) => d.startDate <= d.endDate;

/**
 * Times only have to be ordered on a one-day trip. Leaving at 08:00 on Monday
 * and getting back at 17:00 on Wednesday is not out of order, and comparing
 * the clock alone would say it was.
 */
const hoursAreOrdered = (d: FieldTripInput) =>
  d.startTime === null ||
  d.endTime === null ||
  d.startDate.getTime() !== d.endDate.getTime() ||
  d.startTime < d.endTime;

const HOURS_ORDER = {
  message: "เวลากลับต้องหลังเวลาออก / The return time must be after the departure",
  path: ["endTime"],
};
/** Half a coordinate pin is not a location — require both or neither. */
const coordinatesArePaired = (d: FieldTripInput) =>
  (d.latitude === null) === (d.longitude === null);

export const createFieldTripSchema = fieldTripFields
  .refine(endsAfterItStarts, {
    message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม / The end date cannot precede the start",
    path: ["endDate"],
  })
  .refine(hoursAreOrdered, HOURS_ORDER)
  .refine(coordinatesArePaired, {
    message: "ต้องกรอกทั้งละติจูดและลองจิจูด / Enter both latitude and longitude",
    path: ["longitude"],
  });

/**
 * Editing a trip after it exists, including one already closed out.
 *
 * The completion pair rides along for the same reason it does on a task: once
 * an archived record is editable at all, the half of it people most want to fix
 * is the report — and a summary with a typo in it is worse evidence than a
 * corrected one, provided the correction is itself recorded.
 */
export const updateFieldTripSchema = fieldTripFields
  .extend({
    fieldTripId: z.string().cuid(),
    completionNote: untouchedOrText(5000),
    proofUrl: untouchedOrUrl,
  })
  .refine(endsAfterItStarts, {
    message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม / The end date cannot precede the start",
    path: ["endDate"],
  })
  .refine(hoursAreOrdered, HOURS_ORDER)
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

/** Starting a trip carries nothing but the trip: the timestamp is the server's. */
export const startFieldTripSchema = z.object({ fieldTripId: z.string().cuid() });

/** Deleting a trip for good. Same bargain as deleteTaskSchema — see that. */
export const deleteFieldTripSchema = z.object({
  fieldTripId: z.string().cuid(),
  reason: z
    .string()
    .trim()
    .min(1, "กรุณาระบุเหตุผลในการลบ / A reason is required to delete")
    .max(1000),
});

/**
 * Closing a trip out.
 *
 * Both fields are optional, unlike completeTaskSchema, where the note *is* the
 * evidence and is therefore required. A trip's evidence is that the person was
 * at the place on those days; a summary and a link are offered on top of that,
 * never demanded, because a demand at the end of a day in the field is a
 * demand people meet by typing "-".
 */
export const completeFieldTripSchema = z.object({
  fieldTripId: z.string().cuid(),
  completionNote: optionalText(5000),
  proofUrl: optionalUrl,
});

/** One UI switch on the admin settings page. */
export const settingSchema = z.object({
  key: z.string().refine(isSettingKey, "ไม่รู้จักการตั้งค่านี้ / Unknown setting"),
  enabled: z.enum(["true", "false"]).transform((v) => v === "true"),
});

/**
 * Putting a switch back to its default, which carries no value: the default is
 * the one in code, and the row is deleted rather than rewritten.
 */
export const settingKeySchema = z.object({
  key: z.string().refine(isSettingKey, "ไม่รู้จักการตั้งค่านี้ / Unknown setting"),
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
  proofUrl: optionalUrl,
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
 * Deleting a task for good.
 *
 * The reason is required for the same purpose it is on a reopen or a trip
 * cancellation, only more so: after this runs, the audit row is the only thing
 * left that can answer "why is this gone", because the row it describes no
 * longer exists to be asked.
 */
export const deleteTaskSchema = z.object({
  taskId: z.string().cuid(),
  reason: z
    .string()
    .trim()
    .min(1, "กรุณาระบุเหตุผลในการลบ / A reason is required to delete")
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

/**
 * Customer pins.
 *
 * Coordinates are *required* here, unlike a field trip's, and that is the whole
 * difference between the two features: a trip may be known only by the name of
 * the place, while a pin exists because somebody clicked a point on a map. A
 * pin with no point is not a pin.
 */
const requiredCoordinate = (limit: number) =>
  z
    .string()
    .trim()
    .min(1, "กรุณาเลือกจุดบนแผนที่ / Pick a point on the map")
    .transform((v) => Number(v))
    .refine((n) => Number.isFinite(n) && Math.abs(n) <= limit, {
      message: `พิกัดไม่ถูกต้อง / Coordinate must be between -${limit} and ${limit}`,
    });

const pinFields = z.object({
  label: optionalText(200),
  address: optionalText(300),
  latitude: requiredCoordinate(90),
  longitude: requiredCoordinate(180),
});

/**
 * One lead. Everything but the name and the status is optional, because all of
 * it is somebody's note about a conversation — a pin filled in from the car
 * park gets a name and a colour, and the rest arrives later or never.
 *
 * `ownerId` is an id typed by nobody: the form offers a select of employees.
 * Blank is a real answer (an unclaimed lead), so it parses to null rather than
 * being rejected.
 */
const customerFields = z.object({
  name: z
    .string()
    .trim()
    .min(1, "กรุณากรอกชื่อลูกค้า / A customer name is required")
    .max(200),
  status: z
    .enum(["INTERESTED", "CONSIDERING", "NOT_INTERESTED", "WON", "UNREACHABLE"])
    .default("CONSIDERING"),
  contactName: optionalText(120),
  phone: optionalText(40),
  email: z
    .union([z.string().trim().email(), z.literal("")])
    .nullish()
    .transform((v) => (isBlank(v) ? null : v)),
  lineId: optionalText(80),
  note: optionalText(2000),
  ownerId: z
    .union([z.string().trim().cuid(), z.literal("")])
    .nullish()
    .transform((v) => (isBlank(v) ? null : v)),
  /// When somebody last spoke to them — a fact about the world, typed in, not
  /// the row's updatedAt.
  lastContactedAt: optionalDate,
});

/**
 * Dropping a pin creates its first customer in the same breath. A pin with
 * nobody at it would be a coloured dot that means nothing, and the form that
 * makes one is the same form either way.
 */
export const createCustomerPinSchema = pinFields.merge(customerFields);

/** Correcting the place itself: its name, its address, or where it sits. */
export const updateCustomerPinSchema = pinFields.extend({
  pinId: z.string().cuid(),
});

/** Just the point, for the drag-to-move path — no form, two numbers. */
export const moveCustomerPinSchema = z.object({
  pinId: z.string().cuid(),
  latitude: requiredCoordinate(90),
  longitude: requiredCoordinate(180),
});

export const createCustomerSchema = customerFields.extend({
  pinId: z.string().cuid(),
});

export const updateCustomerSchema = customerFields.extend({
  customerId: z.string().cuid(),
});

/**
 * The one-click path off a status chip. Separate from the edit form because it
 * is the thing this feature exists for: a status changed from a phone, in a
 * car park, without opening a form.
 */
export const setCustomerStatusSchema = z.object({
  customerId: z.string().cuid(),
  status: z.enum([
    "INTERESTED",
    "CONSIDERING",
    "NOT_INTERESTED",
    "WON",
    "UNREACHABLE",
  ]),
});

/** Both deletes demand a reason, on the same terms as deleteTaskSchema: after
 *  they run the audit row is the only thing left that can answer "why". */
export const deleteCustomerPinSchema = z.object({
  pinId: z.string().cuid(),
  reason: z
    .string()
    .trim()
    .min(1, "กรุณาระบุเหตุผลในการลบ / A reason is required to delete")
    .max(1000),
});

export const deleteCustomerSchema = z.object({
  customerId: z.string().cuid(),
  reason: z
    .string()
    .trim()
    .min(1, "กรุณาระบุเหตุผลในการลบ / A reason is required to delete")
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
