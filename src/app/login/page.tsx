import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LocaleSwitch } from "@/components/locale-switch";
import { getCurrentUser } from "@/lib/auth/session";
import { getTranslations } from "@/lib/i18n/server";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "เข้าสู่ระบบ / Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : "/dashboard");

  const t = await getTranslations();
  const { changed } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t("app.name")}</h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {t("app.tagline")}
            </p>
          </div>
          <LocaleSwitch />
        </div>

        <div className="card p-6 space-y-5">
          <div>
            <h2 className="text-base font-medium">{t("login.title")}</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {t("login.subtitle")}
            </p>
          </div>

          <LoginForm passwordChanged={changed === "1"} />
        </div>
      </div>
    </main>
  );
}
