import type { Metadata } from "next";

import { BrandLockup } from "@/components/brand";
import { LocaleSwitch } from "@/components/locale-switch";
import { ThemeSwitch } from "@/components/theme-switch";
import { requireUser } from "@/lib/auth/rbac";
import { getTranslations } from "@/lib/i18n/server";

import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "เปลี่ยนรหัสผ่าน / Change password" };

export default async function ChangePasswordPage() {
  const user = await requireUser();
  const t = await getTranslations();

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl">
              <BrandLockup product={t("app.product")} />
            </h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {user.employeeCode} — {user.fullName}
            </p>
          </div>
          <div className="ms-auto flex items-center justify-end gap-2">
            <ThemeSwitch />
            <LocaleSwitch />
          </div>
        </div>

        <div className="card p-6 space-y-5">
          <div>
            <h2 className="text-base font-medium">{t("password.changeTitle")}</h2>
            {user.mustChangePassword && (
              <p className="mt-1 text-sm" style={{ color: "var(--warning)" }}>
                {t("password.changeRequired")}
              </p>
            )}
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              {t("password.requirements")}
            </p>
          </div>

          <ChangePasswordForm />
        </div>
      </div>
    </main>
  );
}
