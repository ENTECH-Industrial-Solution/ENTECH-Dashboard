import Link from "next/link";

import { getTranslations } from "@/lib/i18n/server";
import { peopleSummary } from "@/lib/trips";
import { STALE_TASK_DAYS, type StaleTask } from "@/server/queries";
import { LinkPending } from "@/components/nav-progress";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Running tasks nobody has moved for a fortnight — what the overdue count
 * misses when a task has no due date, or one still ahead.
 *
 * `linkTo` follows the capsules' rule: an admin's dashboard holds no task
 * cards, so a line opens the first assignee's page at the card; an employee's
 * own board has the card, so a line is an anchor on the page.
 */
export async function StaleTasks({
  tasks,
  total,
  linkTo,
}: {
  tasks: StaleTask[];
  total: number;
  linkTo: "anchor" | "person";
}) {
  const t = await getTranslations();
  const now = Date.now();

  return (
    <section className="panel space-y-3">
      <header>
        <h2 className="font-semibold tracking-tight">
          {t("dashboard.stale")}
          {total > 0 && (
            <span className="ms-2 font-normal" style={{ color: "var(--warning)" }}>
              {total}
            </span>
          )}
        </h2>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {t("dashboard.staleHint")} {STALE_TASK_DAYS} {t("trips.days")}
        </p>
      </header>

      {tasks.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("dashboard.staleNone")}
        </p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => {
            const first = task.assignees[0];
            const href =
              linkTo === "person" && first
                ? `/dashboard/employee/${first.id}#task-${task.id}`
                : `#task-${task.id}`;
            const days = Math.floor((now - new Date(task.lastActivity).getTime()) / DAY_MS);

            return (
              <li key={task.id}>
                <Link href={href} className="block rounded-lg px-2 py-1.5 hover:bg-[var(--surface-muted)]">
                  <span className="flex min-w-0 items-baseline gap-2 text-sm">
                    <span className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>
                      {task.code}
                    </span>
                    <span className="truncate">{task.title}</span>
                  </span>
                  <span
                    className="flex flex-wrap gap-x-2 text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {task.assignees.length > 0 && <span>{peopleSummary(task.assignees)}</span>}
                    <span style={{ color: "var(--warning)" }}>
                      {t("dashboard.staleDays")} {days} {t("trips.days")}
                    </span>
                    {task.status === "BLOCKED" && (
                      <span style={{ color: "var(--danger)" }}>{t("status.BLOCKED")}</span>
                    )}
                  </span>
                  <LinkPending />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {total > tasks.length && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          +{total - tasks.length} {t("dashboard.moreTasks")}
        </p>
      )}
    </section>
  );
}
