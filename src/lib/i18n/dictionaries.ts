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
  "nav.settings": { th: "ตั้งค่า", en: "Settings" },
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
    th: "งานที่เสร็จแล้วถูกล็อกไว้เป็นหลักฐาน เฉพาะผู้ดูแลระบบเท่านั้นที่เปิดใหม่ได้",
    en: "Completed tasks are locked as evidence. Only an administrator can reopen them.",
  },
  "tasks.timeline": { th: "ประวัติการเปลี่ยนแปลง", en: "Activity trail" },
  "tasks.nextDue": { th: "ครบกำหนดถัดไป", en: "Next due" },

  "calendar.title": { th: "ปฏิทินกำหนดส่งงาน", en: "Deadline calendar" },
  "calendar.hint": {
    th: "กดที่วันเพื่อดูงานที่ครบกำหนดวันนั้น แล้วกดที่งานเพื่อไปยังการ์ดงานจริง",
    en: "Pick a day to see what falls due, then open a task to jump to its card",
  },
  "calendar.today": { th: "วันนี้", en: "Today" },
  "calendar.prevMonth": { th: "เดือนก่อนหน้า", en: "Previous month" },
  "calendar.nextMonth": { th: "เดือนถัดไป", en: "Next month" },
  "calendar.emptyDay": { th: "ไม่มีงานครบกำหนดในวันนี้", en: "Nothing due on this day" },
  "calendar.emptyMonth": {
    th: "เดือนนี้ไม่มีงานที่ครบกำหนด",
    en: "Nothing falls due this month",
  },
  "calendar.pickDay": { th: "เลือกวันจากปฏิทิน", en: "Select a day above" },
  "calendar.dueCount": { th: "งานครบกำหนด", en: "due" },

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
  "trips.showMap": { th: "ดูแผนที่", en: "Show map" },
  "trips.hideMap": { th: "ซ่อนแผนที่", en: "Hide map" },
  "trips.statusTitle": { th: "ใครออกนอกสถานที่", en: "Who is off-site" },
  "trips.statusHint": {
    th: "สถานะของคนที่มีกำหนดออกนอกสถานที่",
    en: "Everyone with an off-site day scheduled",
  },
  "trips.outToday": { th: "ออกอยู่ตอนนี้", en: "Out now" },
  "trips.comingUp": { th: "กำลังจะไป", en: "Coming up" },
  "trips.allIn": { th: "ตอนนี้ทุกคนอยู่ในออฟฟิศ", en: "Everyone is in the office" },
  "trips.untilDate": { th: "ถึง", en: "until" },

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
  "employees.codeImmutable": {
    th: "รหัสพนักงานใช้เป็นชื่อผู้ใช้ จึงเปลี่ยนไม่ได้",
    en: "The employee code is the login identifier and cannot be changed",
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

  "settings.title": { th: "ตั้งค่าการแสดงผลของงาน", en: "Task display settings" },
  "settings.subtitle": {
    th: "เปิดหรือปิดแต่ละส่วนของหน้าจองาน มีผลกับผู้ใช้ทุกคนทันที",
    en: "Turn each part of the task UI on or off. Applies to everyone immediately.",
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
