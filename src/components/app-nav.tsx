"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { LocaleSwitch } from "@/components/locale-switch";
import { ThemeSwitch } from "@/components/theme-switch";
import { useTranslations } from "@/lib/i18n/client";
import { useSettings } from "@/lib/settings/client";
import type { SessionUser } from "@/lib/auth/session";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { logoutAction } from "@/server/actions/auth";

type NavLink = { href: string; key: TranslationKey };

// The customer map is the one entry both roles carry, and it sits between them
// on purpose: the board is shared, so the link cannot be an admin's. It is
// spliced in below rather than written into both lists, so the two cannot
// drift apart on where it goes.
const CUSTOMERS_LINK: NavLink = { href: "/customers", key: "nav.customers" };

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

/**
 * The header, in two shapes.
 *
 * Wide, everything is on one line. Narrow, everything but the name and a
 * three-line button moves behind it. The line between the two is `lg`, and it
 * is a measurement rather than a preference: an admin's six Thai labels are
 * ~535px, the switches and the sign-out another 297, and the name 136 — just
 * inside the ~976px `lg` leaves after the container's padding, and nothing
 * smaller. (The person's name and code are the first thing dropped, at `xl`,
 * because they are the one item in the bar nobody navigates with.)
 *
 * That is now tight enough to be worth saying out loud: a *seventh* admin link
 * does not fit, and the row will start scrolling rather than growing. When one
 * is needed, move the break to `xl` — do not shorten a label to buy room.
 *
 * Below that it used to wrap instead, and wrapping is what makes a header stop
 * looking like one: five links on two lines with the switches stranded
 * underneath, taking a third of a phone screen before any content.
 *
 * The links do not disappear into the button — they move into a panel under
 * the bar, together with the switches, the sign-out, and the identity block the
 * bar drops first. Everything reachable at any width, in one place.
 */
export function AppNav({ user }: { user: SessionUser }) {
  const t = useTranslations();
  const pathname = usePathname();
  const settings = useSettings();
  const [open, setOpen] = useState(false);

  // The link disappears with the switch, but hiding it is not what protects the
  // page — /customers calls the same guard itself. See SETTING_IMPACT.
  const base = user.role === "ADMIN" ? ADMIN_LINKS : EMPLOYEE_LINKS;
  const links = settings["customer.enabled"]
    ? [...base.slice(0, 1), CUSTOMERS_LINK, ...base.slice(1)]
    : base;

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const roleLabel = user.role === "ADMIN" ? t("nav.admin") : t("nav.employee");

  // What a disclosure is expected to do. Bound while it is open only, so the
  // page carries no listener the rest of the time.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className="sticky top-0 z-10 border-b backdrop-blur"
      style={{ background: "color-mix(in oklab, var(--surface) 88%, transparent)" }}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-x-4 px-4 py-3 sm:px-6 xl:gap-x-6">
        <Link href="/dashboard" className="shrink-0 font-semibold tracking-tight">
          {t("app.name")}
        </Link>

        {/* `overflow-x-auto` is the release valve: a label longer than these
            leaves the row scrollable rather than pushing the bar apart. */}
        <nav className="hidden items-center gap-1 overflow-x-auto lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors"
              style={
                isActive(link.href)
                  ? { background: "var(--brand-soft)", color: "var(--brand)" }
                  : { color: "var(--text-muted)" }
              }
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-3">
          <div className="hidden text-end xl:block">
            <div className="text-sm leading-tight">{user.fullName}</div>
            <div className="text-xs leading-tight" style={{ color: "var(--text-muted)" }}>
              {user.employeeCode} · {roleLabel}
            </div>
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <ThemeSwitch />
            <LocaleSwitch />

            <form action={logoutAction}>
              <button type="submit" className="btn btn-ghost">
                {t("nav.logout")}
              </button>
            </form>
          </div>

          {/* The wrapper is doing real work: `.btn` sets `display` from
              unlayered CSS in globals.css, and an unlayered rule beats a
              Tailwind utility whatever the breakpoint — `lg:hidden` on the
              button itself is silently ignored, leaving two navigations on
              screen at once. Hiding a plain element around it has no such
              fight to lose. */}
          <div className="lg:hidden">
            <button
              type="button"
              className="btn btn-secondary"
              aria-expanded={open}
              aria-controls="app-menu"
              aria-label={t("nav.menu")}
              onClick={() => setOpen((shown) => !shown)}
            >
              <MenuIcon open={open} />
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div id="app-menu" className="border-t lg:hidden">
          <div className="mx-auto w-full max-w-6xl space-y-3 px-4 py-3 sm:px-6">
            <div>
              <div className="text-sm leading-tight">{user.fullName}</div>
              <div
                className="text-xs leading-tight"
                style={{ color: "var(--text-muted)" }}
              >
                {user.employeeCode} · {roleLabel}
              </div>
            </div>

            {/* Full-width rows rather than the bar's chips: on a phone the
                thing being tapped should be the whole line, not the label. */}
            <nav className="grid gap-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  // Closed here rather than off the pathname: tapping the page
                  // you are already on navigates nowhere, and a menu that
                  // stayed open on that one tap would look stuck.
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-2 text-sm transition-colors"
                  style={
                    isActive(link.href)
                      ? { background: "var(--brand-soft)", color: "var(--brand)" }
                      : { color: "var(--text-muted)" }
                  }
                >
                  {t(link.key)}
                </Link>
              ))}
            </nav>

            <div className="flex flex-wrap items-center gap-3 border-t pt-3">
              <ThemeSwitch />
              <LocaleSwitch />

              <form action={logoutAction} className="ms-auto">
                <button type="submit" className="btn btn-ghost">
                  {t("nav.logout")}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

/** Three lines, or the cross that closes them. */
function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {open ? (
        <path d="M18 6 6 18M6 6l12 12" />
      ) : (
        <path d="M3 6h18M3 12h18M3 18h18" />
      )}
    </svg>
  );
}
