import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar } from "@/components/employee-frame";
import { ScheduleRow } from "@/components/schedule-row";
import { SummaryTiles } from "@/components/summary-tiles";
import { ActiveTaskCard, CompletedTaskCard } from "@/components/task-card";
import { TaskSection } from "@/components/task-section";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth/rbac";
import { formatDateTime, getLocale, getTranslations } from "@/lib/i18n/server";
import { serialiseTask } from "@/lib/serialise";
import {
  getActiveTasks,
  getCompletedTasks,
  getEmployeeProfile,
  getTaskSummary,
} from "@/server/queries";

export const metadata: Metadata = { title: "งานรายบุคคล / Employee" };

/**
 * One person's page: who they are, then the same two sections as the dashboard
 * — active work and the completed archive — narrowed to them.
 *
 * Reached by clicking that person's frame on the dashboard. An employee may
 * only ever open their own; getEmployeeProfile answers null for anyone else and
 * this renders notFound(), so a guessed id does not confirm the person exists.
 */
export default async function EmployeeTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cal?: string }>;
}) {
  const [{ id }, { cal }] = await Promise.all([params, searchParams]);
  const user = await requireUser();

  const profile = await getEmployeeProfile(user, id);
  if (!profile) notFound();

  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const [active, completed, summary] = await Promise.all([
    getActiveTasks(user, id),
    getCompletedTasks(user, { limit: 200, assigneeId: id }),
    getTaskSummary(user, id),
  ]);

  const subtitle = [profile.department, profile.position].filter(Boolean).join(" · ");

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard"
          className="text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          ← {t("dashboard.back")}
        </Link>
      </div>

      <header className="card flex flex-wrap items-start gap-4 p-5">
        <Avatar fullName={profile.fullName} size="lg" muted={!profile.isActive} />

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-lg font-semibold tracking-tight">{profile.fullName}</h1>
            {profile.id === user.id && (
              <span
                className="badge"
                style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
              >
                {t("common.you")}
              </span>
            )}
            {profile.role === "ADMIN" && (
              <span
                className="badge"
                style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}
              >
                {t("nav.admin")}
              </span>
            )}
            <span
              className="badge"
              style={
                profile.isActive
                  ? { background: "var(--success-soft)", color: "var(--success)" }
                  : { background: "var(--danger-soft)", color: "var(--danger)" }
              }
            >
              {profile.isActive ? t("employees.active") : t("employees.inactive")}
            </span>
          </div>

          <div className="font-mono text-sm" style={{ color: "var(--text-muted)" }}>
            {profile.employeeCode}
          </div>

          <dl
            className="flex flex-wrap gap-x-5 gap-y-1 pt-1 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {subtitle && (
              <div className="flex gap-1">
                <dt>{t("employees.department")}:</dt>
                <dd style={{ color: "var(--text)" }}>{subtitle}</dd>
              </div>
            )}
            {profile.email && (
              <div className="flex gap-1">
                <dt>{t("employees.email")}:</dt>
                <dd style={{ color: "var(--text)" }}>{profile.email}</dd>
              </div>
            )}
            <div className="flex gap-1">
              <dt>{t("employees.lastLogin")}:</dt>
              <dd style={{ color: "var(--text)" }}>
                {profile.lastLoginAt
                  ? formatDateTime(profile.lastLoginAt, locale)
                  : t("employees.never")}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <SummaryTiles summary={summary} />

      <ScheduleRow
        user={user}
        cal={cal}
        basePath={`/dashboard/employee/${profile.id}`}
        assigneeId={profile.id}
        linkTasksTo="anchor"
      />

      <TaskSection title={t("tasks.active")} hint={t("tasks.activeHint")}>
        {active.length === 0 ? (
          <EmptyState label={t("tasks.empty")} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {active.map((task) => (
              <ActiveTaskCard
                key={task.id}
                task={serialiseTask(task)}
                canMutate={user.role === "ADMIN" || task.assignee.id === user.id}
              />
            ))}
          </div>
        )}
      </TaskSection>

      <TaskSection
        title={t("tasks.history")}
        hint={t("tasks.historyHint")}
        footnote={completed.length > 0 ? t("tasks.historyLocked") : undefined}
      >
        {completed.length === 0 ? (
          <EmptyState label={t("tasks.empty")} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {completed.map((task) => (
              <CompletedTaskCard
                key={task.id}
                task={serialiseTask(task)}
                isAdmin={user.role === "ADMIN"}
              />
            ))}
          </div>
        )}
      </TaskSection>
    </div>
  );
}
