import Link from "next/link";

import { formatDate, getLocale, getTranslations } from "@/lib/i18n/server";
import type { EmployeeWorkload } from "@/server/queries";

/**
 * One person = one frame on the dashboard. The whole card is a link into that
 * person's page, so an admin can scan headcount at a glance and drill into
 * anyone in a single click.
 *
 * A server component: the counts are already aggregated by the query layer and
 * nothing here is interactive, so none of this needs to ship to the browser.
 */

/** First letters of the first two words — works for Thai and Latin names alike. */
export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0] ?? "")
    .join("");
}

export function Avatar({
  fullName,
  size = "md",
  muted = false,
}: {
  fullName: string;
  size?: "md" | "lg";
  muted?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${
        size === "lg" ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm"
      }`}
      style={
        muted
          ? { background: "var(--surface-muted)", color: "var(--text-muted)" }
          : { background: "var(--brand-soft)", color: "var(--brand)" }
      }
    >
      {initials(fullName)}
    </span>
  );
}

export async function EmployeeFrame({
  workload,
  isSelf = false,
}: {
  workload: EmployeeWorkload;
  isSelf?: boolean;
}) {
  const t = await getTranslations();
  const locale = await getLocale();

  const total = workload.active + workload.completed;
  const progress = total === 0 ? 0 : Math.round((workload.completed / total) * 100);
  const subtitle = [workload.department, workload.position]
    .filter(Boolean)
    .join(" · ");

  const breakdown = [
    { label: t("status.TODO"), value: workload.todo },
    { label: t("status.IN_PROGRESS"), value: workload.inProgress },
    { label: t("status.BLOCKED"), value: workload.blocked },
  ].filter((item) => item.value > 0);

  return (
    <Link
      href={`/dashboard/employee/${workload.id}`}
      className="card card-link space-y-3 p-4"
      style={workload.isActive ? undefined : { opacity: 0.7 }}
    >
      <div className="flex items-start gap-3">
        <Avatar fullName={workload.fullName} muted={!workload.isActive} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate font-medium leading-snug">{workload.fullName}</h3>
            {isSelf && (
              <span
                className="badge"
                style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
              >
                {t("common.you")}
              </span>
            )}
            {workload.role === "ADMIN" && (
              <span
                className="badge"
                style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}
              >
                {t("nav.admin")}
              </span>
            )}
            {!workload.isActive && (
              <span
                className="badge"
                style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
              >
                {t("employees.inactive")}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="font-mono">{workload.employeeCode}</span>
            {subtitle && <span className="truncate">{subtitle}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <FrameStat label={t("tasks.active")} value={workload.active} />
        <FrameStat
          label={t("tasks.overdue")}
          value={workload.overdue}
          tone={workload.overdue > 0 ? "danger" : undefined}
        />
        <FrameStat
          label={t("status.COMPLETED")}
          value={workload.completed}
          tone={workload.completed > 0 ? "success" : undefined}
        />
      </div>

      {total === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {t("employees.noTasks")}
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="meter" role="presentation">
            <span style={{ width: `${progress}%` }} />
          </div>
          <div
            className="flex flex-wrap items-center justify-between gap-x-3 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            <span>
              {t("employees.progress")} {progress}%
            </span>
            {breakdown.length > 0 && (
              <span className="truncate">
                {breakdown.map((item) => `${item.label} ${item.value}`).join(" · ")}
              </span>
            )}
          </div>
        </div>
      )}

      {workload.nextDueDate && (
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {t("tasks.nextDue")}:{" "}
          <span
            style={{
              color:
                workload.nextDueDate < new Date() ? "var(--danger)" : "var(--text)",
            }}
          >
            {formatDate(workload.nextDueDate, locale)}
          </span>
        </div>
      )}
    </Link>
  );
}

function FrameStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
}) {
  const color =
    tone === "success"
      ? "var(--success)"
      : tone === "danger"
        ? "var(--danger)"
        : "var(--text)";

  return (
    <div
      className="rounded-lg px-2 py-1.5 text-center"
      style={{ background: "var(--surface-muted)" }}
    >
      <div className="text-lg font-semibold leading-tight tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="text-[0.6875rem] leading-tight" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
    </div>
  );
}
