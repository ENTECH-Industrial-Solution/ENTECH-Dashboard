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
  // The "ENTECH" half is the logo artwork beside this word, not a string —
  // see src/components/brand.tsx. This is only the part that is not the brand.
  "app.product": { th: "Dashboard", en: "Dashboard" },
  "app.tagline": { th: "ระบบติดตามงานพนักงาน", en: "Employee Task Tracking" },

  "nav.dashboard": { th: "หน้าหลัก", en: "Dashboard" },
  "nav.employees": { th: "จัดการพนักงาน", en: "Employees" },
  "nav.allTasks": { th: "งานทั้งหมด", en: "All Tasks" },
  "nav.audit": { th: "บันทึกการใช้งาน", en: "Audit Log" },
  "nav.customers": { th: "แผนที่ลูกค้า", en: "Customer Map" },
  "nav.settings": { th: "ตั้งค่า", en: "Settings" },
  "nav.logout": { th: "ออกจากระบบ", en: "Sign out" },
  "nav.admin": { th: "ผู้ดูแลระบบ", en: "Administrator" },
  "nav.employee": { th: "พนักงาน", en: "Employee" },
  "nav.menu": { th: "เมนู", en: "Menu" },

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
  "tasks.historySharedHint": {
    th: "งานที่เสร็จแล้วของทุกคน ดูได้ทุกคน แต่แก้ไขไม่ได้",
    en: "Everyone's completed work — visible to all, read only",
  },
  "tasks.empty": { th: "ยังไม่มีงานในหมวดนี้", en: "No tasks in this section" },
  "tasks.new": { th: "สร้างงานใหม่", en: "New task" },
  "tasks.kind": { th: "ออกนอกสถานที่ไหม", en: "What kind of work?" },
  "tasks.kindTask": { th: "งานปกติ", en: "Task" },
  "tasks.kindTrip": { th: "ออกนอกสถานที่", en: "Field trip" },
  "tasks.title": { th: "ชื่องาน", en: "Task title" },
  "tasks.description": { th: "รายละเอียด", en: "Description" },
  "tasks.assignee": { th: "ผู้รับผิดชอบ", en: "Assignee" },
  "tasks.startDate": { th: "วันเริ่มงาน", en: "Start date" },
  "tasks.dueDate": { th: "กำหนดส่ง", en: "Due date" },
  "tasks.assignedBy": { th: "ผู้มอบหมาย", en: "Assigned by" },
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
    th: "งานที่เสร็จแล้วแก้ไขและเปิดใหม่ได้เฉพาะผู้ดูแลระบบ ทุกครั้งจะถูกบันทึกว่าใครทำ เมื่อไหร่ และเปลี่ยนอะไร",
    en: "Only an administrator can edit or reopen a completed task, and every change records who, when, and what it changed.",
  },
  "tasks.timeline": { th: "ประวัติการเปลี่ยนแปลง", en: "Activity trail" },
  "tasks.nextDue": { th: "ครบกำหนดถัดไป", en: "Next due" },
  "tasks.edit": { th: "แก้ไขข้อมูล", en: "Edit" },
  "tasks.editTitle": { th: "แก้ไขข้อมูลงาน", en: "Edit task" },
  "tasks.editArchivedHint": {
    th: "แก้ไขสรุปผลงานที่บันทึกไว้ตอนปิดงาน การแก้ไขทุกครั้งถูกบันทึกว่าใครแก้ แก้เมื่อไหร่ และแก้จากอะไรเป็นอะไร",
    en: "Correcting the record filed when this was closed. Every edit is logged with who made it, when, and what it changed from.",
  },
  "tasks.editAudited": {
    th: "การแก้ไขงานที่เสร็จแล้วจะถูกบันทึกไว้ในบันทึกการใช้งาน",
    en: "Editing a completed task is written to the audit log",
  },
  "tasks.delete": { th: "ลบงาน", en: "Delete" },
  "tasks.deleteConfirm": { th: "ยืนยันลบถาวร", en: "Delete permanently" },
  "tasks.deleteReason": { th: "เหตุผลในการลบ", en: "Reason for deleting" },
  "tasks.deleteWarning": {
    th: "ลบแล้วกู้คืนไม่ได้ ประวัติการเปลี่ยนแปลงของงานนี้จะถูกลบไปพร้อมกัน เหลือเพียงสำเนาข้อมูลงานที่ระบบเก็บไว้ในบันทึกการใช้งาน",
    en: "This cannot be undone. The task's activity trail goes with it — all that remains is the copy this writes to the audit log.",
  },

  "calendar.title": { th: "ปฏิทินงาน", en: "Work calendar" },
  "calendar.hint": {
    th: "กดที่วันเพื่อดูงานที่เริ่มและงานที่ครบกำหนดวันนั้น แล้วกดที่งานเพื่อไปยังการ์ดงานจริง",
    en: "Pick a day to see what starts and what falls due, then open a task to jump to its card",
  },
  "calendar.today": { th: "วันนี้", en: "Today" },
  "calendar.prevMonth": { th: "เดือนก่อนหน้า", en: "Previous month" },
  "calendar.nextMonth": { th: "เดือนถัดไป", en: "Next month" },
  "calendar.emptyDay": { th: "ไม่มีงานในวันนี้", en: "Nothing on this day" },
  "calendar.emptyMonth": {
    th: "เดือนนี้ไม่มีงานที่มีกำหนดวัน",
    en: "Nothing dated this month",
  },
  "calendar.pickDay": { th: "เลือกวันจากปฏิทิน", en: "Select a day above" },
  "calendar.dueCount": { th: "งานครบกำหนด", en: "due" },
  "calendar.startCount": { th: "งานเริ่มวันนี้", en: "starting" },
  "calendar.marksDue": { th: "ครบกำหนด", en: "Due" },
  "calendar.marksStart": { th: "เริ่มงาน", en: "Starts" },

  "dashboard.byPerson": { th: "งานรายบุคคล", en: "By employee" },
  "dashboard.byPersonHint": {
    th: "หนึ่งกรอบคือพนักงานหนึ่งคน กดที่กรอบเพื่อดูงานทั้งหมดของคนนั้น",
    en: "One frame per employee — open a frame to see all of their work",
  },
  "dashboard.noEmployees": {
    th: "ยังไม่มีพนักงานในระบบ",
    en: "No employees yet",
  },
  "dashboard.back": { th: "กลับหน้าหลัก", en: "Back to dashboard" },
  "dashboard.morePeople": { th: "คนอื่น", en: "others" },
  "dashboard.moreTasks": { th: "งานอื่น", en: "more" },
  "dashboard.personTasks": { th: "งานของพนักงานคนนี้", en: "This employee's work" },

  "trips.title": { th: "ตารางออกนอกสถานที่", en: "Field trip schedule" },
  "trips.subtitle": {
    th: "ใครออกไปที่ไหน วันไหนบ้าง กดที่หมุดเพื่อเปิด Google Maps",
    en: "Who is off-site, where, and when. Open the pin in Google Maps.",
  },
  "trips.new": { th: "เพิ่มการเดินทาง", en: "Add a trip" },
  "trips.edit": { th: "แก้ไข", en: "Edit" },
  "trips.upcoming": { th: "ที่กำลังจะถึงและกำลังไป", en: "Upcoming and current" },
  "trips.upcomingHint": {
    th: "รวมรายการที่ยังไม่จบวันนี้",
    en: "Includes trips that have not finished yet",
  },
  "trips.past": { th: "ที่ผ่านมาแล้ว", en: "Past trips" },
  "trips.person": { th: "ผู้เดินทาง", en: "Traveller" },
  "trips.purpose": { th: "เรื่องที่ไป", en: "Purpose" },
  "trips.location": { th: "สถานที่", en: "Location" },
  "trips.address": { th: "ที่อยู่", en: "Address" },
  "trips.latitude": { th: "ละติจูด", en: "Latitude" },
  "trips.longitude": { th: "ลองจิจูด", en: "Longitude" },
  "trips.mapUrl": { th: "ลิงก์ Google Maps", en: "Google Maps link" },
  "trips.mapUrlHint": {
    th: "วางลิงก์จาก Google Maps ถ้ามี ระบบจะใช้ลิงก์นี้ก่อนพิกัด",
    en: "Paste a Google Maps link if you have one — it takes precedence over the coordinates",
  },
  "trips.coordHint": {
    th: "เปิด Google Maps คลิกขวาที่จุดนั้น แล้วกดที่ตัวเลขพิกัดเพื่อคัดลอก",
    en: "In Google Maps, right-click the spot and click the coordinates to copy them",
  },
  "trips.openMap": { th: "เปิดแผนที่", en: "Open in Maps" },
  "trips.pinned": { th: "ปักหมุดไว้แล้ว", en: "Pinned" },
  "trips.searchOnly": { th: "ค้นหาจากชื่อสถานที่", en: "Searched by name" },
  "trips.startDate": { th: "วันที่ไป", en: "From" },
  "trips.endDate": { th: "ถึงวันที่", en: "To" },
  "trips.note": { th: "หมายเหตุ", en: "Note" },
  "trips.days": { th: "วัน", en: "days" },
  "trips.cancelTrip": { th: "ยกเลิกการเดินทาง", en: "Cancel trip" },
  "trips.cancelReason": { th: "เหตุผลในการยกเลิก", en: "Reason for cancelling" },
  "trips.cancelled": { th: "ยกเลิกแล้ว", en: "Cancelled" },
  "trips.empty": { th: "ยังไม่มีรายการในหมวดนี้", en: "Nothing scheduled here" },
  "trips.away": { th: "ออกนอกสถานที่", en: "Off-site" },
  "trips.recordedBy": { th: "ผู้บันทึก", en: "Recorded by" },
  "trips.expandMap": { th: "ขยายแผนที่", en: "Expand map" },
  "trips.statusTitle": { th: "ใครออกนอกสถานที่", en: "Who is off-site" },
  "trips.statusHint": {
    th: "สถานะของคนที่มีกำหนดออกนอกสถานที่",
    en: "Everyone with an off-site day scheduled",
  },
  "trips.outToday": { th: "ออกอยู่ตอนนี้", en: "Out now" },
  "trips.comingUp": { th: "กำลังจะไป", en: "Coming up" },
  "trips.allIn": { th: "ตอนนี้ทุกคนอยู่ในออฟฟิศ", en: "Everyone is in the office" },
  "trips.untilDate": { th: "ถึง", en: "until" },
  "trips.tripCount": { th: "รายการ", en: "trips" },

  "trips.startTime": { th: "เวลาออก", en: "Leaves at" },
  "trips.endTime2": { th: "เวลากลับ", en: "Back at" },
  "trips.hoursHint": {
    th: "ไม่กรอกจะถือเป็นเวลาราชการ 08:30–16:30",
    en: "Left blank, the standard office hours 08:30–16:30 apply",
  },
  "trips.officeHours": { th: "เวลาราชการ", en: "office hours" },
  "trips.start": { th: "เริ่มทำงานนอกสถานที่", en: "Start off-site work" },
  "trips.complete": { th: "เสร็จภารกิจ", en: "Mission complete" },
  "trips.onSite": { th: "กำลังทำงานนอกสถานที่", en: "On site" },
  "trips.done": { th: "เสร็จภารกิจแล้ว", en: "Completed" },
  "trips.startedAt": { th: "เริ่มเมื่อ", en: "Started" },
  "trips.completedAt": { th: "เสร็จเมื่อ", en: "Completed" },
  "trips.completionNote": {
    th: "สรุปผลภารกิจ",
    en: "Mission summary",
  },
  "trips.proofUrl": { th: "ลิงก์หลักฐาน", en: "Evidence link" },
  "trips.history": { th: "ประวัติการออกนอกสถานที่", en: "Off-site history" },
  "trips.historyHint": {
    th: "ภารกิจที่ผ่านมาแล้ว เก็บไว้ถาวรเป็นหลักฐาน",
    en: "Trips whose days have passed, kept permanently as a record",
  },
  "trips.historyEmpty": {
    th: "ยังไม่มีประวัติการออกนอกสถานที่",
    en: "No off-site work recorded yet",
  },
  "trips.delete": { th: "ลบงาน", en: "Delete" },
  "trips.deleteConfirm": { th: "ยืนยันลบถาวร", en: "Delete permanently" },
  "trips.deleteReason": { th: "เหตุผลในการลบ", en: "Reason for deleting" },
  "trips.deleteWarning": {
    th: "ลบแล้วกู้คืนไม่ได้ เหลือเพียงสำเนาข้อมูลการเดินทางที่ระบบเก็บไว้ในบันทึกการใช้งาน",
    en: "This cannot be undone. All that remains is the copy this writes to the audit log.",
  },
  "trips.completedLocked": {
    th: "ภารกิจที่เสร็จแล้วยกเลิกไม่ได้ แก้ไขได้เฉพาะผู้ดูแลระบบ และทุกการแก้ไขถูกบันทึกว่าใครแก้ เมื่อไหร่ และเปลี่ยนอะไร",
    en: "A completed trip cannot be cancelled. An administrator may still correct it, and every edit records who, when, and what it changed.",
  },
  "trips.editArchivedHint": {
    th: "แก้ไขสรุปผลภารกิจที่บันทึกไว้ตอนปิดงาน การแก้ไขทุกครั้งถูกบันทึกว่าใครแก้ แก้เมื่อไหร่ และแก้จากอะไรเป็นอะไร",
    en: "Correcting the report filed when this trip was closed. Every edit is logged with who made it, when, and what it changed from.",
  },

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
  "employees.edit": { th: "แก้ไขข้อมูล", en: "Edit" },
  "employees.editTitle": { th: "แก้ไขข้อมูลพนักงาน", en: "Edit employee" },
  "employees.codeChangeWarning": {
    th: "รหัสพนักงานใช้เป็นชื่อผู้ใช้ ถ้าแก้ พนักงานต้องใช้รหัสใหม่ในการเข้าสู่ระบบ (ไม่หลุดจากระบบ)",
    en: "The employee code is the login identifier. Change it and they sign in with the new one — their session is not cut off.",
  },
  "employees.roleChangeWarning": {
    th: "การเปลี่ยนสิทธิ์จะทำให้พนักงานคนนี้หลุดจากระบบทันทีและต้องเข้าสู่ระบบใหม่",
    en: "Changing the role signs this employee out immediately",
  },
  "employees.cannotDemoteSelf": {
    th: "ไม่สามารถลดสิทธิ์ของตนเองได้",
    en: "You cannot demote your own account",
  },
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
  "employees.progress": { th: "ความคืบหน้า", en: "Progress" },
  "employees.noTasks": { th: "ยังไม่ได้รับมอบหมายงาน", en: "No tasks assigned yet" },
  "employees.viewTasks": { th: "ดูงานทั้งหมด", en: "View all tasks" },
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
  "employees.delete": { th: "ลบถาวร", en: "Delete permanently" },
  "employees.deleteTitle": { th: "ลบบัญชีนี้ถาวร", en: "Delete this account" },
  "employees.deleteWarning": {
    th: "ลบแล้วกู้คืนไม่ได้ ทำได้เฉพาะบัญชีที่ระงับแล้วและไม่มีงานหรือการเดินทางอ้างถึง บันทึกการใช้งานจะเก็บสำเนาข้อมูลบัญชีและเหตุผลไว้",
    en: "This cannot be undone. Only a deactivated account with no task or trip pointing at it can go. The audit log keeps a copy of the account and the reason.",
  },
  "employees.deleteReason": { th: "เหตุผลในการลบ", en: "Reason for deleting" },
  "employees.deleteConfirm": { th: "ยืนยันลบถาวร", en: "Delete permanently" },
  "employees.deleteOnlyInactive": {
    th: "ต้องระงับบัญชีก่อนจึงจะลบถาวรได้",
    en: "Deactivate the account before it can be deleted",
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

  "theme.label": { th: "ธีมการแสดงผล", en: "Appearance" },
  "theme.system": { th: "ตามเครื่อง", en: "System" },
  "theme.light": { th: "สว่าง", en: "Light" },
  "theme.dark": { th: "มืด", en: "Dark" },

  "settings.title": { th: "ตั้งค่าการแสดงผล", en: "Display settings" },
  "settings.subtitle": {
    th: "เปิดหรือปิดแต่ละส่วนของหน้าจอ มีผลกับผู้ใช้ทุกคนทันที และทุกครั้งที่แก้จะถูกบันทึกไว้ในบันทึกการใช้งาน",
    en: "Turn each part of the UI on or off. Applies to everyone immediately, and every change is written to the audit log.",
  },
  "settings.defaultsNote": {
    th: "ทุกสวิตช์ค่าเริ่มต้นคือเปิด ฐานข้อมูลเก็บแถวเฉพาะอันที่แอดมินแก้ การคืนค่าเริ่มต้นคือลบแถวนั้นทิ้ง",
    en: "Every switch defaults to on. The database holds a row only for the ones an admin changed, and resetting deletes that row.",
  },
  "settings.default": { th: "ค่าเริ่มต้น", en: "Default" },
  "settings.changed": { th: "แก้จากค่าเริ่มต้น", en: "Changed from default" },
  "settings.reset": { th: "คืนค่าเริ่มต้น", en: "Reset to default" },
  "settings.lastChanged": { th: "แก้ล่าสุด", en: "Last changed" },
  "settings.neverChanged": { th: "ยังไม่เคยแก้", en: "Never changed" },
  "settings.enabledCount": { th: "เปิดอยู่", en: "On" },
  "settings.impactDisplay": { th: "แค่การแสดงผล", en: "Display only" },
  "settings.impactReads": { th: "ปิดแล้วประหยัดการดึงข้อมูล", en: "Skips a query when off" },
  "settings.impactAccess": { th: "มีผลกับสิทธิ์การอ่าน", en: "Changes who can read" },

  "settings.groupTask": { th: "การ์ดงาน", en: "Task cards" },
  "settings.groupTaskHint": {
    th: "อะไรบ้างที่แสดงบนการ์ดงานแต่ละใบ ทั้งหมดเป็นเรื่องการแสดงผล ไม่กระทบสิทธิ์ของใคร",
    en: "What each task card shows. All display-only — none of these change who may see what.",
  },
  "settings.groupDashboard": { th: "หน้าหลัก", en: "Dashboard" },
  "settings.groupDashboardHint": {
    th: "ส่วนประกอบของหน้าหลัก บางอันปิดแล้วระบบจะไม่ดึงข้อมูลส่วนนั้นเลย",
    en: "The pieces of the dashboard. Some are not merely hidden when off — they are not fetched.",
  },
  "settings.groupFieldTrip": { th: "ออกนอกสถานที่", en: "Field trips" },
  "settings.groupFieldTripHint": {
    th: "เปิด-ปิดทั้งระบบทริป และรายละเอียดที่แต่ละทริปแสดง",
    en: "The field trip feature as a whole, and what a single trip shows.",
  },
  "settings.on": { th: "เปิดใช้อยู่", en: "On" },
  "settings.off": { th: "ปิดอยู่", en: "Off" },
  "settings.enable": { th: "เปิดใช้", en: "Turn on" },
  "settings.disable": { th: "ปิด", en: "Turn off" },
  "settings.affectsAccess": {
    th: "การตั้งค่านี้เปลี่ยนสิ่งที่พนักงานเห็นได้ ไม่ใช่แค่การแสดงผล",
    en: "This one changes what employees may read, not just what is drawn",
  },

  "settings.showAssigner": { th: "แสดงผู้มอบหมายงาน", en: "Show who assigned the task" },
  "settings.showAssignerHint": {
    th: "แสดงชื่อผู้ดูแลระบบที่เป็นคนสร้างและมอบหมายงานนั้นบนการ์ดงาน",
    en: "Names the administrator who created and assigned the task, on its card",
  },
  "settings.showSchedule": { th: "แสดงวันเริ่มงานและกำหนดส่ง", en: "Show start and due dates" },
  "settings.showScheduleHint": {
    th: "แสดงช่วงเวลาที่วางแผนไว้บนการ์ดงาน ปิดแล้วยังบันทึกวันที่ได้ตามปกติ",
    en: "Shows the planned window on the card. Dates are still recorded when off.",
  },
  "settings.showDescription": { th: "แสดงรายละเอียดงาน", en: "Show task description" },
  "settings.showDescriptionHint": {
    th: "แสดงรายละเอียดยาวใต้ชื่องาน ปิดเพื่อให้การ์ดกระชับขึ้น",
    en: "Shows the long description under the title. Turn off for compact cards.",
  },
  "settings.showProof": { th: "เปิดช่องลิงก์หลักฐาน", en: "Enable the evidence link field" },
  "settings.showProofHint": {
    th: "ให้กรอกลิงก์หลักฐานตอนปิดงาน ปิดแล้วลิงก์เดิมที่บันทึกไว้จะยังแสดงอยู่",
    en: "Offers the evidence link when completing a task. Links already saved still show.",
  },
  "settings.fieldTrip": { th: "เปิดใช้ระบบออกนอกสถานที่", en: "Enable field trips" },
  "settings.fieldTripHint": {
    th: "ปิดแล้วเมนู หน้าตาราง และหมุดในปฏิทินจะหายไปทั้งหมด ข้อมูลเดิมยังอยู่ครบ",
    en: "When off the menu, the schedule page, and the calendar pins all disappear. Existing records are kept.",
  },
  "settings.showCalendar": { th: "แสดงปฏิทินในหน้าหลัก", en: "Show the calendar on the dashboard" },
  "settings.showCalendarHint": {
    th: "ปิดแล้วระบบจะไม่ดึงข้อมูลปฏิทินเลย ไม่ใช่แค่ซ่อน",
    en: "When off the calendar is not queried at all, not merely hidden",
  },
  "settings.sharedHistory": {
    th: "ให้พนักงานเห็นประวัติงานที่เสร็จแล้วของทุกคน",
    en: "Let employees read everyone's completed history",
  },
  "settings.sharedHistoryHint": {
    th: "ปิดแล้วพนักงานจะเห็นเฉพาะประวัติงานของตัวเอง ผู้ดูแลระบบยังเห็นทั้งหมด การแก้ไขไม่เปลี่ยนไม่ว่าเปิดหรือปิด",
    en: "When off, an employee sees only their own history. Admins still see all. Edit rights are unchanged either way.",
  },
  "settings.showPriority": { th: "แสดงป้ายความสำคัญ", en: "Show the priority badge" },
  "settings.showPriorityHint": {
    th: "ป้าย ด่วน/สูง/กลาง/ต่ำ บนการ์ดงาน ปิดแล้วยังตั้งความสำคัญได้เหมือนเดิม แค่ไม่แสดงบนการ์ด",
    en: "The urgent/high/medium/low chip on a card. Priority is still set and stored when off, just not drawn.",
  },
  "settings.showVideo": { th: "เล่นวิดีโอหลักฐานในการ์ด", en: "Play video evidence in place" },
  "settings.showVideoHint": {
    th: "ลิงก์ YouTube หรือ Drive จะเล่นได้ในการ์ดเลย ปิดแล้วยังเป็นลิงก์ที่กดเปิดแท็บใหม่ได้ตามปกติ",
    en: "A YouTube or Drive link plays inside the card. Off, it stays a link that opens in a new tab.",
  },
  "settings.showSummary": { th: "แสดงแถบสรุปสามตัวเลข", en: "Show the summary strip" },
  "settings.showSummaryHint": {
    th: "ตัวเลขกำลังดำเนินการ เกินกำหนด และเสร็จแล้ว ที่หัวหน้าหลัก ปิดแล้วระบบจะไม่นับตัวเลขนี้เลย",
    en: "The active, overdue, and completed counts at the top of the dashboard. Off, they are not counted at all.",
  },
  "settings.showPeople": {
    th: "แสดงข้อมูลรายบุคคลในหน้าหลัก",
    en: "Show per-person breakdowns",
  },
  "settings.showPeopleHint": {
    th: "กรอบพนักงานแต่ละคน และแคปซูลรายคนในแถบสรุป ทั้งสองใช้ข้อมูลชุดเดียวกัน ปิดแล้วจะไม่ดึงภาระงานของทุกคนเลย หน้าจัดการพนักงานยังเข้าได้",
    en: "The employee frames and the per-person capsules in the summary strip — one read feeds both. Off, nobody's workload is fetched; the employee page still works.",
  },
  "settings.showMap": { th: "แสดงแผนที่ย่อในทริป", en: "Show the mini map on a trip" },
  "settings.showMapHint": {
    th: "แผนที่เล็กข้างที่อยู่ ปิดแล้วเหลือแค่ลิงก์เปิดแผนที่ ซึ่งเบากว่ามากเมื่อหน้าหนึ่งมีหลายทริป",
    en: "The small map beside a trip's address. Off, only the link to Maps remains — much lighter on a page of many trips.",
  },
  "settings.showTripHistory": {
    th: "แสดงประวัติออกนอกสถานที่รายบุคคล",
    en: "Show per-person trip history",
  },
  "settings.showTripHistoryHint": {
    th: "ส่วนทริปที่ผ่านมาแล้วในหน้าหลักและหน้ารายบุคคล ปิดแล้วจะไม่ดึงข้อมูลส่วนนี้ ทริปทั้งหมดยังดูได้ที่หน้างานทั้งหมด",
    en: "The past-trips section on the dashboard and a person's page. Off, it is not fetched; every trip is still on the all-tasks page.",
  },

  "video.play": { th: "กดเพื่อเล่นคลิป", en: "Play video" },

  "customers.title": { th: "แผนที่ลูกค้า", en: "Customer map" },
  "customers.subtitle": {
    th: "ปักหมุดลูกค้าตามจุด และติดตามสถานะของแต่ละราย",
    en: "Pin customers where they are, and track where each one stands",
  },
  "customers.status.interested": { th: "สนใจ", en: "Interested" },
  "customers.status.considering": { th: "ลังเล", en: "Considering" },
  "customers.status.notInterested": { th: "ยังไม่เอา", en: "Not interested" },
  "customers.status.won": { th: "ปิดการขายแล้ว", en: "Closed / won" },
  "customers.status.unreachable": { th: "ติดต่อไม่ได้", en: "Unreachable" },

  "customers.addPin": { th: "เล็งเป้าปักหมุด", en: "Aim a pin" },
  "customers.addPinHint": {
    th: "โหมดเล็ง: เลื่อนแผนที่ให้เป้าตรงจุดที่ต้องการ แล้วกด “ปักตรงนี้” — แม่นกว่าการกดด้วยนิ้ว",
    en: "Aiming mode: move the map until the crosshair is on the spot, then press “Pin here” — steadier than a fingertip",
  },
  "customers.pinHere": { th: "ปักตรงนี้", en: "Pin here" },
  "customers.quickPinHint": {
    th: "กดตรงไหนก็ได้บนแผนที่เพื่อปักหมุดตรงนั้นทันที · กดหมุดเดิมเพื่อดูข้อมูลลูกค้า",
    en: "Click anywhere on the map to pin that spot · click a pin to see its customers",
  },
  "customers.cancelPlacing": { th: "เลิกปักหมุด", en: "Stop placing" },
  "customers.newPin": { th: "หมุดใหม่", en: "New pin" },
  "customers.pinLabel": { th: "ชื่อจุด", en: "Place name" },
  "customers.pinLabelHint": {
    th: "เช่น อาคาร A นิคมอุตสาหกรรม ตลาดสด — เว้นว่างได้ถ้าจุดนี้มีลูกค้ารายเดียว",
    en: "A building, an estate, a market — leave it blank when the pin holds one customer",
  },
  "customers.address": { th: "ที่อยู่", en: "Address" },
  "customers.coordinates": { th: "พิกัด", en: "Coordinates" },
  "customers.openInMaps": { th: "เปิดใน Google Maps", en: "Open in Google Maps" },
  "customers.movePin": { th: "ย้ายหมุด", en: "Move pin" },
  "customers.movePinHint": {
    th: "ลากหมุดไปยังจุดใหม่ แล้วกดบันทึกตำแหน่ง",
    en: "Drag the marker to the new spot, then save the position",
  },
  "customers.savePosition": { th: "บันทึกตำแหน่ง", en: "Save position" },
  "customers.deletePin": { th: "ลบหมุดนี้", en: "Delete this pin" },
  "customers.deletePinWarning": {
    th: "ลบหมุดแล้วลูกค้าทุกรายที่จุดนี้จะถูกลบไปด้วย และกู้คืนไม่ได้ ระบบจะเก็บสำเนาทั้งหมดไว้ในบันทึกการใช้งาน",
    en: "Deleting the pin deletes every customer standing at it, permanently. A full copy is kept in the audit log.",
  },

  "customers.customerOptional": {
    th: "ยังไม่รู้ว่าใครอยู่ตรงนี้ก็ได้ — ปักหมุดไว้ก่อนแล้วค่อยเพิ่มลูกค้าทีหลัง",
    en: "You need not know who is here yet — pin the place now and add customers later",
  },
  "customers.noCustomersYet": {
    th: "ยังไม่มีลูกค้าที่จุดนี้",
    en: "No customers at this pin yet",
  },
  "customers.addCustomer": { th: "เพิ่มลูกค้าที่จุดนี้", en: "Add a customer here" },
  "customers.customerName": { th: "ชื่อลูกค้า / บริษัท", en: "Customer or company" },
  "customers.contactName": { th: "ชื่อผู้ติดต่อ", en: "Contact person" },
  "customers.phone": { th: "เบอร์โทร", en: "Phone" },
  "customers.email": { th: "อีเมล", en: "Email" },
  "customers.lineId": { th: "LINE ID", en: "LINE ID" },
  "customers.note": { th: "โน้ต", en: "Notes" },
  "customers.owner": { th: "ผู้รับผิดชอบ", en: "Owner" },
  "customers.unassigned": { th: "ยังไม่มีผู้รับผิดชอบ", en: "Unassigned" },
  "customers.lastContactedAt": { th: "ติดต่อล่าสุด", en: "Last contacted" },
  "customers.neverContacted": { th: "ยังไม่เคยบันทึกการติดต่อ", en: "No contact recorded" },
  "customers.editCustomer": { th: "แก้ไข", en: "Edit" },
  "customers.deleteCustomer": { th: "ลบลูกค้ารายนี้", en: "Delete this customer" },
  "customers.changeStatus": { th: "เปลี่ยนสถานะ", en: "Change status" },
  "customers.reason": { th: "เหตุผล", en: "Reason" },
  "customers.reasonRequired": {
    th: "ต้องระบุเหตุผล เพราะเมื่อลบแล้วจะไม่มีอะไรเหลือให้ย้อนดู",
    en: "A reason is required — once it is gone, nothing else can say why",
  },

  "customers.stackCount": { th: "ลูกค้าที่จุดนี้", en: "Customers here" },
  "customers.empty": {
    th: "ยังไม่มีหมุดลูกค้า กด “ปักหมุดใหม่” แล้วเลือกจุดบนแผนที่",
    en: "No customer pins yet. Press “Drop a pin” and choose a spot on the map.",
  },
  "customers.noMatches": {
    th: "ไม่พบหมุดที่ตรงกับที่ค้นหา",
    en: "No pins match the current filter",
  },
  "customers.searchPlaceholder": {
    th: "ค้นหาลูกค้าที่ปักไว้ หรือพิมพ์ชื่อสถานที่แล้วกด Enter",
    en: "Filter your pins, or type a place name and press Enter",
  },
  "customers.searchPlace": { th: "ค้นหาสถานที่บนแผนที่", en: "Find a place on the map" },
  "customers.placeResults": { th: "สถานที่ที่พบ", en: "Places found" },
  "customers.noPlaces": {
    th: "ไม่พบสถานที่ชื่อนี้ ลองพิมพ์ให้ละเอียดขึ้น เช่น ใส่ชื่อเขตหรือจังหวัดด้วย",
    en: "No place by that name. Try adding a district or province.",
  },
  "customers.searchingPlace": { th: "กำลังค้นหาสถานที่...", en: "Searching for the place..." },
  "customers.clearPlaces": { th: "ปิดผลการค้นหา", en: "Dismiss results" },
  "customers.placeAttribution": {
    th: "ค้นหาสถานที่โดย OpenStreetMap",
    en: "Place search by OpenStreetMap",
  },
  "customers.filterStatus": { th: "กรองตามสถานะ", en: "Filter by status" },
  "customers.legend": { th: "สีของหมุด", en: "Pin colours" },
  "customers.pinCount": { th: "หมุด", en: "pins" },
  "customers.customerCount": { th: "ราย", en: "customers" },
  "customers.list": { th: "รายการหมุด", en: "Pin list" },
  "customers.closePanel": { th: "ปิดแผง", en: "Close panel" },
  "customers.backToList": { th: "กลับไปรายการ", en: "Back to the list" },
  "customers.mapAttribution": {
    th: "แผนที่จาก OpenStreetMap",
    en: "Map data from OpenStreetMap",
  },
  "customers.mapStyle": { th: "หน้าตาแผนที่", en: "Map style" },
  "customers.style.clean": { th: "เรียบ", en: "Clean" },
  "customers.style.standard": { th: "มาตรฐาน", en: "Standard" },
  "customers.style.contrast": { th: "คมชัด", en: "High contrast" },
  "customers.zoomIn": { th: "ขยาย", en: "Zoom in" },
  "customers.zoomOut": { th: "ย่อ", en: "Zoom out" },
  "customers.locateAll": { th: "ดูหมุดทั้งหมด", en: "Fit all pins" },

  "settings.customerMap": { th: "เปิดใช้งานแผนที่ลูกค้า", en: "Enable the customer map" },
  "settings.customerMapHint": {
    th: "ปิดแล้วเมนูแผนที่ลูกค้าจะหายไปและหน้านั้นเข้าไม่ได้ ระบบจะไม่ดึงข้อมูลหมุดเลย ข้อมูลที่ปักไว้ยังอยู่ครบและกลับมาเมื่อเปิดใหม่",
    en: "Off, the nav link disappears, the page is unreachable, and no pins are fetched. Everything already pinned stays and returns when it is switched back on.",
  },
  "settings.groupCustomer": { th: "แผนที่ลูกค้า", en: "Customer map" },
  "settings.groupCustomerHint": {
    th: "หน้าแผนที่สำหรับติดตามสถานะลูกค้าตามจุด",
    en: "The map page for tracking where each customer stands",
  },

  "common.save": { th: "บันทึก", en: "Save" },
  "common.cancel": { th: "ยกเลิก", en: "Cancel" },
  "common.create": { th: "สร้าง", en: "Create" },
  "common.close": { th: "ปิด", en: "Close" },
  "common.confirm": { th: "ยืนยัน", en: "Confirm" },
  "common.saving": { th: "กำลังบันทึก...", en: "Saving..." },
  "common.loading": { th: "กำลังโหลด...", en: "Loading..." },
  "common.optional": { th: "ไม่บังคับ", en: "optional" },
  "common.search": { th: "ค้นหา", en: "Search" },
  "common.all": { th: "ทั้งหมด", en: "All" },
  "common.none": { th: "-", en: "-" },
  "common.error": { th: "เกิดข้อผิดพลาด", en: "Something went wrong" },
  "common.you": { th: "คุณ", en: "You" },
  "common.slidePrev": { th: "เลื่อนไปทางซ้าย", en: "Scroll left" },
  "common.slideNext": { th: "เลื่อนไปทางขวา", en: "Scroll right" },
  "common.showMore": { th: "ดูเพิ่มเติม", en: "Show more" },
  "common.showLess": { th: "ย่อลง", en: "Show less" },
} satisfies Record<string, Entry>;

export type TranslationKey = keyof typeof dictionary;
