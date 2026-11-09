import { CountUp } from "@/components/count-up";
import { WorkloadShare, type WorkloadPillRow } from "@/components/workload-pills";
import { getTranslations } from "@/lib/i18n/server";
import type { EmployeeWorkload, WorkloadMetric } from "@/server/queries";

/**
 * The three headline counts, shared by the dashboard and a person's page.
 *
 * When more than one person is in view each tile also breaks its number down:
 * one bar split into each person's share, and a legend naming them — so
 * "4 งานที่กำลังดำเนินการ" answers *whose* without scrolling to the frames
 * below. One bar rather than a row per person keeps the three tiles the same
 * few lines tall, where a row each left "overdue" mostly empty beside a
 * "completed" five rows deep.
 *
 * With one person (an employee's own dashboard, or one person's page) the
 * breakdown is skipped — a single full-width bar restates the number above it.
 *
 * Each legend entry opens onto the tasks behind it, loaded on demand — see
 * `WorkloadShare`. That is why the breakdown is a client component while the
 * tile around it stays server-rendered: only the entries need state.
 */
export async function SummaryTiles({
  summary,
  people,
}: {
  summary: { active: number; overdue: number; completed: number };
  people?: EmployeeWorkload[];
}) {
  const t = await getTranslations();
  // Two different "+N": more people the tile could not list, and more tasks a
  // capsule could not list. They are never the same word.
  const morePeople = t("dashboard.morePeople");
  const moreTasks = t("dashboard.moreTasks");

  const breakdown = (metric: WorkloadMetric) => {
    if (!people || people.length < 2) return undefined;

    const rows = people
      .map((person) => ({
        id: person.id,
        name: person.fullName,
        value: person[metric],
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);

    return rows.length > 0 ? rows : undefined;
  };

  const rowsBy = {
    active: breakdown("active"),
    overdue: breakdown("overdue"),
    completed: breakdown("completed"),
  };

  // The big number counts a job once; the names count it under each person on
  // it (`getTaskSummary` vs `getEmployeeWorkloads`). Where the names add up to
  // more than the number, the bar reads as a share of something it is not, so
  // the strip says why — once, not on every tile.
  const hasSharedWork = (["active", "overdue", "completed"] as const).some((metric) => {
    const rows = rowsBy[metric];
    return rows !== undefined && rows.reduce((sum, row) => sum + row.value, 0) > summary[metric];
  });

  return (
    // A container query rather than a viewport one: the same strip runs across
    // a person's page and stands as a column in the dashboard's gutter, and
    // only the strip knows which.
    <div className="@container">
      <section className="grid grid-cols-1 gap-3 @xl:grid-cols-3">
        <SummaryTile
          label={t("tasks.active")}
          value={summary.active}
          metric="active"
          rows={rowsBy.active}
          morePeople={morePeople}
          moreTasks={moreTasks}
        />
        <SummaryTile
          label={t("tasks.overdue")}
          value={summary.overdue}
          tone={summary.overdue > 0 ? "danger" : undefined}
          metric="overdue"
          rows={rowsBy.overdue}
          morePeople={morePeople}
          moreTasks={moreTasks}
        />
        <SummaryTile
          label={t("status.COMPLETED")}
          value={summary.completed}
          tone="success"
          metric="completed"
          rows={rowsBy.completed}
          morePeople={morePeople}
          moreTasks={moreTasks}
        />
      </section>
      {hasSharedWork && (
        <p className="mt-2 px-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {t("dashboard.sharedNote")}
        </p>
      )}
    </div>
  );
}

/** How many people the legend names; the rest are a count. The bar has all. */
const MAX_NAMED = 3;

function SummaryTile({
  label,
  value,
  tone,
  metric,
  rows,
  morePeople,
  moreTasks,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
  metric: WorkloadMetric;
  rows?: WorkloadPillRow[];
  morePeople: string;
  moreTasks: string;
}) {
  const color =
    tone === "success"
      ? "var(--success)"
      : tone === "danger"
        ? "var(--danger)"
        : "var(--brand)";

  return (
    <div className="card space-y-3 px-4 py-3">
      <div>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {label}
        </div>
        <div
          className="mt-1 text-2xl font-semibold tabular-nums"
          style={{ color: value > 0 ? color : "var(--text)" }}
        >
          <CountUp value={value} />
        </div>
      </div>

      {rows && (
        <WorkloadShare
          rows={rows}
          metric={metric}
          color={color}
          limit={MAX_NAMED}
          morePeople={morePeople}
          moreLabel={moreTasks}
        />
      )}
    </div>
  );
}
