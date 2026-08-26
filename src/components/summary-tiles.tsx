import { getTranslations } from "@/lib/i18n/server";
import type { EmployeeWorkload } from "@/server/queries";

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
 */
export async function SummaryTiles({
  summary,
  people,
}: {
  summary: { active: number; overdue: number; completed: number };
  people?: EmployeeWorkload[];
}) {
  const t = await getTranslations();
  const moreLabel = t("dashboard.morePeople");

  const breakdown = (metric: "active" | "overdue" | "completed") => {
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
        rows={breakdown("active")}
        moreLabel={moreLabel}
      />
      <SummaryTile
        label={t("tasks.overdue")}
        value={summary.overdue}
        tone={summary.overdue > 0 ? "danger" : undefined}
        rows={breakdown("overdue")}
        moreLabel={moreLabel}
      />
      <SummaryTile
        label={t("status.COMPLETED")}
        value={summary.completed}
        tone="success"
        rows={breakdown("completed")}
        moreLabel={moreLabel}
      />
    </section>
  );
}

type Row = { id: string; name: string; value: number };

/** Beyond this the tile turns into a list; the rest collapse into a count. */
const MAX_ROWS = 4;

function SummaryTile({
  label,
  value,
  tone,
  rows,
  moreLabel,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
  rows?: Row[];
  moreLabel: string;
}) {
  const color =
    tone === "success"
      ? "var(--success)"
      : tone === "danger"
        ? "var(--danger)"
        : "var(--brand)";

  const shown = rows?.slice(0, MAX_ROWS) ?? [];
  const hidden = (rows?.length ?? 0) - shown.length;
  const max = shown[0]?.value ?? 0;

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
          {shown.map((row) => (
            <div key={row.id} className="pill">
              <span
                className="pill-fill"
                style={{
                  width: `${max === 0 ? 0 : Math.round((row.value / max) * 100)}%`,
                  background: `color-mix(in oklab, ${color} 32%, var(--surface-muted))`,
                }}
              />
              <span className="pill-label">{row.name}</span>
              {/* Plain text, not the tone: the number sits on the fill whenever
                  a bar is near full, and tinted text on a tinted fill measured
                  below 4.5:1. The tone is already carried by the fill itself. */}
              <span className="pill-value">{row.value}</span>
            </div>
          ))}

          {hidden > 0 && (
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              +{hidden} {moreLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
