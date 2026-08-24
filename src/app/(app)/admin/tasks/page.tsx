import type { Metadata } from "next";

import { ActiveTaskCard, CompletedTaskCard, type TaskCardData } from "@/components/task-card";
import { EmptyState } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/rbac";
import { getTranslations } from "@/lib/i18n/server";
import {
  getActiveTasks,
  getAssignableEmployees,
  getCompletedTasks,
} from "@/server/queries";

import { TaskCreator } from "./task-creator";

export const metadata: Metadata = { title: "งานทั้งหมด / All tasks" };

/** Admin view: assign new work, and see every employee's active and completed tasks. */
export default async function AdminTasksPage() {
  const admin = await requireAdmin();
  const t = await getTranslations();

  const [assignees, active, completed] = await Promise.all([
    getAssignableEmployees(),
    getActiveTasks(admin),
    getCompletedTasks(admin, 200),
  ]);

  const serialise = (
    task: Awaited<ReturnType<typeof getActiveTasks>>[number],
  ): TaskCardData => ({
    ...task,
    dueDate: task.dueDate?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
  });

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t("nav.allTasks")}</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {t("app.tagline")}
          </p>
        </div>
        <TaskCreator assignees={assignees} />
      </header>

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">{t("tasks.active")}</h2>
        {active.length === 0 ? (
          <EmptyState label={t("tasks.empty")} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {active.map((task) => (
              <ActiveTaskCard key={task.id} task={serialise(task)} canMutate />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">{t("tasks.history")}</h2>
        {completed.length === 0 ? (
          <EmptyState label={t("tasks.empty")} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {completed.map((task) => (
              <CompletedTaskCard key={task.id} task={serialise(task)} isAdmin />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
