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
          rows={breakdown("active")}
          morePeople={morePeople}
          moreTasks={moreTasks}
        />
        <SummaryTile
          label={t("tasks.overdue")}
          value={summary.overdue}
          tone={summary.overdue > 0 ? "danger" : undefined}
          metric="overdue"
          rows={breakdown("overdue")}
          morePeople={morePeople}
          moreTasks={moreTasks}
        />
        <SummaryTile
          label={t("status.COMPLETED")}
          value={summary.completed}
          tone="success"
          metric="completed"
          rows={breakdown("completed")}
          morePeople={morePeople}
          moreTasks={moreTasks}
        />
      </section>
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
