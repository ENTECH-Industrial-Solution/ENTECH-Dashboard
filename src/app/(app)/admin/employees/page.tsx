import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/rbac";
import { getTranslations } from "@/lib/i18n/server";
import { getEmployeesWithCounts } from "@/server/queries";

import { EmployeeManager, type EmployeeRow } from "./employee-manager";

export const metadata: Metadata = { title: "จัดการพนักงาน / Employees" };

export default async function EmployeesPage() {
  const admin = await requireAdmin();
  const t = await getTranslations();
  const employees = await getEmployeesWithCounts();

  const rows: EmployeeRow[] = employees.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    fullName: e.fullName,
    email: e.email,
    department: e.department,
    position: e.position,
    role: e.role,
    isActive: e.isActive,
    lastLoginAt: e.lastLoginAt?.toISOString() ?? null,
    openTasks: e._count.assignedTasks,
  }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">{t("employees.title")}</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("employees.subtitle")}
        </p>
      </header>

      <EmployeeManager employees={rows} currentUserId={admin.id} />
    </div>
  );
}
