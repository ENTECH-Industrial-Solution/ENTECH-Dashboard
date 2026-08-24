import type { Metadata } from "next";

import { ActiveTaskCard, CompletedTaskCard, type TaskCardData } from "@/components/task-card";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth/rbac";
import { getTranslations } from "@/lib/i18n/server";
import {
  getActiveTasks,
  getCompletedTasks,
  getTaskSummary,
} from "@/server/queries";

export const metadata: Metadata = { title: "หน้าหลัก / Dashboard" };

/**
 * The main screen, in the two sections the system exists to provide:
 *
 *   1. Active   — งานที่กำลังดำเนินการ, still open, actionable.
 *   2. History  — ประวัติงานที่เสร็จแล้ว, completed and locked as evidence.
 *
 * Admins see every employee's tasks here; employees see only their own. That
 * narrowing happens inside the query layer, not in this component.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const t = await getTranslations();

  const [active, completed, summary] = await Promise.all([
    getActiveTasks(user),
    getCompletedTasks(user),
    getTaskSummary(user),
  ]);

  // Dates cross the server/client boundary as ISO strings so the client card
  // can format them in the viewer's locale without a serialisation warning.
  const serialise = (task: Awaited<ReturnType<typeof getActiveTasks>>[number]): TaskCardData => ({
    ...task,
    dueDate: task.dueDate?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
  });

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-3 gap-3">
        <SummaryTile label={t("tasks.active")} value={summary.active} />
        <SummaryTile
          label={t("tasks.overdue")}
          value={summary.overdue}
          tone={summary.overdue > 0 ? "danger" : undefined}
        />
        <SummaryTile label={t("status.COMPLETED")} value={summary.completed} tone="success" />
      </section>

      <section className="space-y-3">
        <header>
          <h2 className="text-lg font-semibold tracking-tight">{t("tasks.active")}</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {t("tasks.activeHint")}
          </p>
        </header>

        {active.length === 0 ? (
          <EmptyState label={t("tasks.empty")} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {active.map((task) => (
              <ActiveTaskCard
                key={task.id}
                task={serialise(task)}
                canMutate={user.role === "ADMIN" || task.assignee.id === user.id}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <header>
          <h2 className="text-lg font-semibold tracking-tight">{t("tasks.history")}</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {t("tasks.historyHint")}
          </p>
        </header>

        {completed.length === 0 ? (
          <EmptyState label={t("tasks.empty")} />
        ) : (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              {completed.map((task) => (
                <CompletedTaskCard
                  key={task.id}
                  task={serialise(task)}
                  isAdmin={user.role === "ADMIN"}
                />
              ))}
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t("tasks.historyLocked")}
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function SummaryTile({
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
    <div className="card px-4 py-3">
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
