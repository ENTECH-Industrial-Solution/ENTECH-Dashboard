"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandWordmark } from "@/components/brand";
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
 * three-line button moves behind it. The line between the two is `xl`, and it
 * is a measurement rather than a preference: an admin's six Thai labels are
 * ~536px, the switches and the sign-out another 297, and the wordmark 136 —
 * 1017 with the gaps, which is more than `lg` leaves after the container's
 * padding (976) and comfortably inside `xl`. The break was `lg` until the
 * customer map added a sixth link: the row did not grow, it started scrolling,
 * which is the one thing a header must not do. Do not shorten a label to buy
 * the break back.
 *
 * The bar is also wider than the page under it — `88rem` against `PageShell`'s
 * `72rem` — and that is the same measurement. At `72rem` the links, the
 * identity block and the switches were 61px over the line, so the row scrolled
 * *and* the name broke across three lines. A navigation bar is the width of the
 * window rather than of the column, so widening it is the honest fix; the
 * wordmark sitting outside the content column is what makes it read as a bar.
 *
 * The row is a three-column grid — `1fr auto 1fr` — rather than a flex row that
 * pushes the controls out with `ms-auto`, so the links sit in the middle of the
 * bar instead of tucked against the wordmark. Each item names its column, and
 * that is load-bearing: a hidden `<nav>` is not a grid item at all, so under
 * auto-placement the controls would slide into the middle column the moment the
 * links moved into the menu button. The side columns stay equal until one
 * outgrows its share, which is what the identity block does at `2xl` — the
 * links drift 18px off centre there rather than colliding with it, and that
 * graceful give is why this is a grid and not an absolutely centred row.
 *
 * The identity block is dropped first, now at `2xl`, because it is the one item
 * nobody navigates with — and the one whose width is typed by a person rather
 * than fixed here, so it is also the one that must not decide whether the links
 * fit.
 *
 * Below the break the links do not disappear into the button — they move into a
 * panel under the bar, together with the switches, the sign-out, and the
 * identity block. Everything reachable at any width, in one place. It used to
 * wrap instead, and wrapping is what makes a header stop looking like one: five
 * links on two lines with the switches stranded underneath, taking a third of a
 * phone screen before any content.
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
      <div className="mx-auto grid w-full max-w-[88rem] grid-cols-[1fr_auto_1fr] items-center gap-x-4 px-4 py-3 sm:px-6 xl:gap-x-6">
        <Link
          href="/dashboard"
          className="col-start-1 flex shrink-0 items-center gap-2 font-semibold tracking-tight whitespace-nowrap"
        >
          <BrandWordmark className="h-[0.875em] w-auto shrink-0" />
          {t("app.product")}
        </Link>

        {/* `overflow-x-auto` is the release valve: a label longer than these
            leaves the row scrollable rather than pushing the bar apart. */}
        <nav className="col-start-2 hidden items-center gap-1 overflow-x-auto xl:flex">
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

        <div className="col-start-3 flex items-center justify-end gap-3">
          <div className="hidden text-end whitespace-nowrap 2xl:block">
            <div className="text-sm leading-tight">{user.fullName}</div>
            <div className="text-xs leading-tight" style={{ color: "var(--text-muted)" }}>
              {user.employeeCode} · {roleLabel}
            </div>
          </div>

          <div className="hidden items-center gap-3 xl:flex">
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
              Tailwind utility whatever the breakpoint — `xl:hidden` on the
              button itself is silently ignored, leaving two navigations on
              screen at once. Hiding a plain element around it has no such
              fight to lose. */}
          <div className="xl:hidden">
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
        <div id="app-menu" className="border-t xl:hidden">
          <div className="mx-auto w-full max-w-[88rem] space-y-3 px-4 py-3 sm:px-6">
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
