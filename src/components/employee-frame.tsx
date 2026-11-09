import Link from "next/link";

import { Avatar } from "@/components/avatar";
import { bangkokDayKey, dueState, todayKey } from "@/lib/calendar";
import { formatDate, getLocale, getTranslations } from "@/lib/i18n/server";
import { PROGRESS_WINDOW_DAYS, type EmployeeWorkload } from "@/server/queries";
import { LinkPending } from "@/components/nav-progress";

/**
 * One person = one frame on the dashboard. The whole card is a link into that
 * person's page, so an admin can scan headcount at a glance and drill into
 * anyone in a single click.
 *
 * A server component: the counts are already aggregated by the query layer and
 * nothing here is interactive, so none of this needs to ship to the browser.
 */

/** The same three tones the task card gives a deadline. */
const NEXT_DUE_COLOR = {
  overdue: "var(--danger)",
  today: "var(--warning)",
  open: "var(--text)",
} as const;

/** Whole Bangkok days a deadline is behind `today`; both are calendar days. */
function daysLate(due: Date, today: string): number {
  const day = 24 * 60 * 60 * 1000;
  return Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${bangkokDayKey(due)}T00:00:00Z`)) / day,
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

  const today = todayKey();
  const dueNow = workload.nextDueDate ? dueState(workload.nextDueDate, today) : null;

  const total = workload.active + workload.completed;
  // Open work against what was finished lately, not against everything ever
  // finished — see EmployeeWorkload.completedRecent. With nothing open there is
  // nothing to make progress on, and the bar is left out rather than drawn full.
  const recentTotal = workload.active + workload.completedRecent;
  const progress =
    recentTotal === 0 ? 0 : Math.round((workload.completedRecent / recentTotal) * 100);
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
        <Avatar fullName={workload.fullName} muted={!workload.isActive} photo={workload.photo} />

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

      {total === 0 || workload.active === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {total === 0 ? t("employees.noTasks") : t("employees.nothingOpen")}
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
              {t("employees.progress")} ({PROGRESS_WINDOW_DAYS} {t("trips.days")}) {progress}%
            </span>
            {breakdown.length > 0 && (
              <span className="truncate">
                {breakdown.map((item) => `${item.label} ${item.value}`).join(" · ")}
              </span>
            )}
          </div>
        </div>
      )}

      {workload.nextDueDate && dueNow && (
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {dueNow === "overdue" ? (
            // "Next due" with a date behind us reads as an upcoming one that is
            // simply wrong, so a missed deadline says how late it is instead.
            <span style={{ color: NEXT_DUE_COLOR.overdue }}>
              {t("tasks.overdueBy")} {daysLate(workload.nextDueDate, today)} {t("trips.days")}
              {" · "}
              {formatDate(workload.nextDueDate, locale)}
            </span>
          ) : (
            <>
              {t("tasks.nextDue")}:{" "}
              <span style={{ color: NEXT_DUE_COLOR[dueNow] }}>
                {formatDate(workload.nextDueDate, locale)}
              </span>
            </>
          )}
        </div>
      )}
      <LinkPending />
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
