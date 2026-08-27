import { WorkloadPills, type WorkloadPillRow } from "@/components/workload-pills";
import { getTranslations } from "@/lib/i18n/server";
import type { EmployeeWorkload, WorkloadMetric } from "@/server/queries";

/**
 * The three headline counts, shared by the dashboard and a person's page.
 *
 * When more than one person is in view each tile also breaks its number down
 * into one capsule per person — name, count, and fill in a single row — so
 * "4 งานที่กำลังดำเนินการ" answers *whose* without scrolling to the frames
 * below. Capsules are scaled against the largest value in that tile rather than
 * the total: the question they answer is "who is carrying the most", and a
 * share-of-total bar makes two people with 3 and 1 look nearly the same when
 * the tile is this narrow.
 *
 * With one person (an employee's own dashboard, or one person's page) the
 * breakdown is skipped — a single full-width bar restates the number above it.
 *
 * Each capsule opens onto the tasks behind it, loaded on demand — see
 * `WorkloadPills`. That is why the list is a client component while the tile
 * around it stays server-rendered: only the capsules need state.
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
    <section className="grid gap-3 sm:grid-cols-3">
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
  );
}

/** Beyond this the tile turns into a list; the rest collapse into a count. */
const MAX_ROWS = 4;

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

  const shown = rows?.slice(0, MAX_ROWS) ?? [];
  const hidden = (rows?.length ?? 0) - shown.length;

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
          {value}
        </div>
      </div>

      {shown.length > 0 && (
        <div className="space-y-1.5">
          <WorkloadPills
            rows={shown}
            metric={metric}
            color={color}
            moreLabel={moreTasks}
          />

          {hidden > 0 && (
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              +{hidden} {morePeople}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
