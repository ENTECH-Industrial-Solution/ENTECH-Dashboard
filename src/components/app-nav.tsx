"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LocaleSwitch } from "@/components/locale-switch";
import { ThemeSwitch } from "@/components/theme-switch";
import { useTranslations } from "@/lib/i18n/client";
import type { SessionUser } from "@/lib/auth/session";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { logoutAction } from "@/server/actions/auth";

type NavLink = { href: string; key: TranslationKey };

const EMPLOYEE_LINKS: NavLink[] = [{ href: "/dashboard", key: "nav.dashboard" }];

// Field trips live inside the all-tasks page rather than a page of their own:
// assigning a trip is assigning work, so it starts from the same button.
const ADMIN_LINKS: NavLink[] = [
  { href: "/dashboard", key: "nav.dashboard" },
  { href: "/admin/tasks", key: "nav.allTasks" },
  { href: "/admin/employees", key: "nav.employees" },
  { href: "/admin/audit", key: "nav.audit" },
  { href: "/admin/settings", key: "nav.settings" },
];

export function AppNav({ user }: { user: SessionUser }) {
  const t = useTranslations();
  const pathname = usePathname();
  const links = user.role === "ADMIN" ? ADMIN_LINKS : EMPLOYEE_LINKS;

  return (
    <header
      className="sticky top-0 z-10 border-b backdrop-blur"
      style={{ background: "color-mix(in oklab, var(--surface) 88%, transparent)" }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="font-semibold tracking-tight">
          {t("app.name")}
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {links.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-2.5 py-1.5 text-sm transition-colors"
                style={
                  active
                    ? { background: "var(--brand-soft)", color: "var(--brand)" }
                    : { color: "var(--text-muted)" }
                }
              >
                {t(link.key)}
              </Link>
            );
          })}
        </nav>

        <div className="ms-auto flex items-center gap-3">
          <div className="hidden text-end sm:block">
            <div className="text-sm leading-tight">{user.fullName}</div>
            <div className="text-xs leading-tight" style={{ color: "var(--text-muted)" }}>
              {user.employeeCode} ·{" "}
              {user.role === "ADMIN" ? t("nav.admin") : t("nav.employee")}
            </div>
          </div>

          <ThemeSwitch />
          <LocaleSwitch />

          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost">
              {t("nav.logout")}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
