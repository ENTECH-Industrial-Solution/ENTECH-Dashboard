/**
 * Flat key -> { th, en } dictionary.
 *
 * Kept deliberately simple: no routing-based locale segments, no extra
 * dependency. The active locale lives in a plain cookie so both server
 * components and client components can read it, and switching never changes
 * the URL (bookmarks and shared links stay stable across languages).
 */
export const LOCALES = ["th", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "th";
export const LOCALE_COOKIE = "entech_locale";

type Entry = { th: string; en: string };

export const dictionary = {
  "app.name": { th: "ENTECH Dashboard", en: "ENTECH Dashboard" },
  "app.tagline": { th: "ระบบติดตามงานพนักงาน", en: "Employee Task Tracking" },

  "nav.dashboard": { th: "หน้าหลัก", en: "Dashboard" },
  "nav.employees": { th: "จัดการพนักงาน", en: "Employees" },
  "nav.allTasks": { th: "งานทั้งหมด", en: "All Tasks" },
  "nav.audit": { th: "บันทึกการใช้งาน", en: "Audit Log" },
  "nav.logout": { th: "ออกจากระบบ", en: "Sign out" },
  "nav.admin": { th: "ผู้ดูแลระบบ", en: "Administrator" },
  "nav.employee": { th: "พนักงาน", en: "Employee" },

  "login.title": { th: "เข้าสู่ระบบ", en: "Sign in" },
  "login.subtitle": {
    th: "ใช้รหัสพนักงานที่ได้รับจากผู้ดูแลระบบ",
    en: "Use the employee code issued by your administrator",
  },
  "login.employeeCode": { th: "รหัสพนักงาน", en: "Employee code" },
  "login.password": { th: "รหัสผ่าน", en: "Password" },
  "login.submit": { th: "เข้าสู่ระบบ", en: "Sign in" },
  "login.submitting": { th: "กำลังเข้าสู่ระบบ...", en: "Signing in..." },
  "login.invalid": {
    th: "รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง",
    en: "Invalid employee code or password",
  },
  "login.locked": {
    th: "บัญชีถูกล็อกชั่วคราวจากการพยายามเข้าสู่ระบบผิดหลายครั้ง กรุณารอสักครู่",
    en: "Account temporarily locked after too many failed attempts. Please wait.",
  },
  "login.inactive": {
    th: "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
    en: "This account is deactivated. Please contact your administrator.",
  },
  "login.rateLimited": {
    th: "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่ภายหลัง",
    en: "Too many attempts. Please try again later.",
  },

  "password.changeTitle": { th: "เปลี่ยนรหัสผ่าน", en: "Change password" },
  "password.changeRequired": {
    th: "คุณต้องตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน",
    en: "You must set a new password before continuing",
  },
  "password.current": { th: "รหัสผ่านปัจจุบัน", en: "Current password" },
  "password.new": { th: "รหัสผ่านใหม่", en: "New password" },
  "password.confirm": { th: "ยืนยันรหัสผ่านใหม่", en: "Confirm new password" },
  "password.mismatch": { th: "รหัสผ่านไม่ตรงกัน", en: "Passwords do not match" },
  "password.wrongCurrent": {
    th: "รหัสผ่านปัจจุบันไม่ถูกต้อง",
    en: "Current password is incorrect",
  },
  "password.changed": {
    th: "เปลี่ยนรหัสผ่านเรียบร้อย กรุณาเข้าสู่ระบบใหม่",
    en: "Password changed. Please sign in again.",
  },
  "password.requirements": {
    th: "อย่างน้อย 12 ตัวอักษร ประกอบด้วยตัวพิมพ์เล็ก พิมพ์ใหญ่ ตัวเลข และอักขระพิเศษ",
    en: "At least 12 characters with lowercase, uppercase, a number, and a symbol",
  },

  "tasks.active": { th: "งานที่กำลังดำเนินการ", en: "Active tasks" },
  "tasks.activeHint": { th: "งานที่ยังทำไม่เสร็จ", en: "Work still in progress" },
  "tasks.history": { th: "ประวัติงานที่เสร็จแล้ว", en: "Completed history" },
  "tasks.historyHint": {
    th: "เก็บไว้เป็นหลักฐาน แก้ไขไม่ได้",
    en: "Kept as evidence — read only",
  },
  "tasks.empty": { th: "ยังไม่มีงานในหมวดนี้", en: "No tasks in this section" },
  "tasks.new": { th: "สร้างงานใหม่", en: "New task" },
  "tasks.title": { th: "ชื่องาน", en: "Task title" },
  "tasks.description": { th: "รายละเอียด", en: "Description" },
  "tasks.assignee": { th: "ผู้รับผิดชอบ", en: "Assignee" },
  "tasks.dueDate": { th: "กำหนดส่ง", en: "Due date" },
  "tasks.priority": { th: "ความสำคัญ", en: "Priority" },
  "tasks.status": { th: "สถานะ", en: "Status" },
  "tasks.start": { th: "เริ่มงาน", en: "Start" },
  "tasks.block": { th: "ติดปัญหา", en: "Blocked" },
  "tasks.resume": { th: "ทำต่อ", en: "Resume" },
  "tasks.complete": { th: "ทำเสร็จแล้ว", en: "Mark complete" },
  "tasks.reopen": { th: "เปิดงานใหม่", en: "Reopen" },
  "tasks.completionNote": {
    th: "สรุปผลงาน / หลักฐาน",
    en: "Completion note / evidence",
  },
  "tasks.proofUrl": { th: "ลิงก์หลักฐาน", en: "Evidence link" },
  "tasks.reopenReason": { th: "เหตุผลในการเปิดงานใหม่", en: "Reason for reopening" },
  "tasks.completedAt": { th: "เสร็จเมื่อ", en: "Completed" },
  "tasks.createdAt": { th: "สร้างเมื่อ", en: "Created" },
  "tasks.overdue": { th: "เกินกำหนด", en: "Overdue" },
  "tasks.historyLocked": {
    th: "งานที่เสร็จแล้วถูกล็อกไว้เป็นหลักฐาน เฉพาะผู้ดูแลระบบเท่านั้นที่เปิดใหม่ได้",
    en: "Completed tasks are locked as evidence. Only an administrator can reopen them.",
  },
  "tasks.timeline": { th: "ประวัติการเปลี่ยนแปลง", en: "Activity trail" },

  "status.TODO": { th: "รอเริ่ม", en: "To do" },
  "status.IN_PROGRESS": { th: "กำลังทำ", en: "In progress" },
  "status.BLOCKED": { th: "ติดปัญหา", en: "Blocked" },
  "status.COMPLETED": { th: "เสร็จแล้ว", en: "Completed" },

  "priority.LOW": { th: "ต่ำ", en: "Low" },
  "priority.MEDIUM": { th: "ปานกลาง", en: "Medium" },
  "priority.HIGH": { th: "สูง", en: "High" },
  "priority.URGENT": { th: "ด่วนมาก", en: "Urgent" },

  "employees.title": { th: "จัดการพนักงาน", en: "Employee management" },
  "employees.subtitle": {
    th: "สร้าง ระงับ และรีเซ็ตรหัสผ่านของบัญชีพนักงาน",
    en: "Create, deactivate, and reset employee accounts",
  },
  "employees.new": { th: "เพิ่มพนักงาน", en: "Add employee" },
  "employees.code": { th: "รหัสพนักงาน", en: "Employee code" },
  "employees.name": { th: "ชื่อ-นามสกุล", en: "Full name" },
  "employees.email": { th: "อีเมล", en: "Email" },
  "employees.department": { th: "แผนก", en: "Department" },
  "employees.position": { th: "ตำแหน่ง", en: "Position" },
  "employees.role": { th: "สิทธิ์การใช้งาน", en: "Role" },
  "employees.status": { th: "สถานะ", en: "Status" },
  "employees.active": { th: "ใช้งานอยู่", en: "Active" },
  "employees.inactive": { th: "ระงับแล้ว", en: "Deactivated" },
  "employees.deactivate": { th: "ระงับบัญชี", en: "Deactivate" },
  "employees.reactivate": { th: "คืนสถานะ", en: "Reactivate" },
  "employees.resetPassword": { th: "รีเซ็ตรหัสผ่าน", en: "Reset password" },
  "employees.tempPassword": {
    th: "รหัสผ่านชั่วคราว — แสดงครั้งเดียวเท่านั้น",
    en: "Temporary password — shown once only",
  },
  "employees.tempPasswordHint": {
    th: "ส่งให้พนักงานผ่านช่องทางที่ปลอดภัย ระบบจะบังคับให้เปลี่ยนเมื่อเข้าสู่ระบบครั้งแรก",
    en: "Share via a secure channel. The employee must change it on first sign-in.",
  },
  "employees.lastLogin": { th: "เข้าสู่ระบบล่าสุด", en: "Last sign-in" },
  "employees.never": { th: "ยังไม่เคย", en: "Never" },
  "employees.openTasks": { th: "งานค้าง", en: "Open tasks" },
  "employees.deactivateConfirm": {
    th: "ระงับบัญชีนี้? ประวัติงานทั้งหมดจะยังถูกเก็บไว้เป็นหลักฐาน",
    en: "Deactivate this account? All task history is retained as evidence.",
  },
  "employees.cannotDeactivateSelf": {
    th: "ไม่สามารถระงับบัญชีของตนเองได้",
    en: "You cannot deactivate your own account",
  },
  "employees.hasActiveTasks": {
    th: "พนักงานคนนี้ยังมีงานค้างอยู่ กรุณาย้ายงานก่อน",
    en: "This employee still has open tasks. Reassign them first.",
  },
  "employees.codeTaken": {
    th: "รหัสพนักงานนี้ถูกใช้แล้ว",
    en: "That employee code is already in use",
  },

  "audit.title": { th: "บันทึกการใช้งาน", en: "Audit log" },
  "audit.subtitle": {
    th: "บันทึกแบบเพิ่มอย่างเดียว ลบหรือแก้ไขไม่ได้",
    en: "Append-only record — cannot be edited or deleted",
  },
  "audit.time": { th: "เวลา", en: "Time" },
  "audit.actor": { th: "ผู้ดำเนินการ", en: "Actor" },
  "audit.action": { th: "การกระทำ", en: "Action" },
  "audit.target": { th: "เป้าหมาย", en: "Target" },
  "audit.ip": { th: "IP", en: "IP" },

  "common.save": { th: "บันทึก", en: "Save" },
  "common.cancel": { th: "ยกเลิก", en: "Cancel" },
  "common.create": { th: "สร้าง", en: "Create" },
  "common.close": { th: "ปิด", en: "Close" },
  "common.confirm": { th: "ยืนยัน", en: "Confirm" },
  "common.saving": { th: "กำลังบันทึก...", en: "Saving..." },
  "common.optional": { th: "ไม่บังคับ", en: "optional" },
  "common.search": { th: "ค้นหา", en: "Search" },
  "common.all": { th: "ทั้งหมด", en: "All" },
  "common.none": { th: "-", en: "-" },
  "common.error": { th: "เกิดข้อผิดพลาด", en: "Something went wrong" },
  "common.you": { th: "คุณ", en: "You" },
} satisfies Record<string, Entry>;

export type TranslationKey = keyof typeof dictionary;
