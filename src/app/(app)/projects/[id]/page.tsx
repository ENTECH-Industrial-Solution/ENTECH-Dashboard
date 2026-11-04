import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CardGrid } from "@/components/card-grid";
import { LinkPending } from "@/components/nav-progress";
import { PageShell } from "@/components/page-shell";
import { ProjectCard } from "@/components/project-card";
import { ProjectAdminControls } from "@/components/project-form";
import { ProjectOptionsProvider } from "@/components/project-picker";
import { ActiveTaskCard, CompletedTaskCard } from "@/components/task-card";
import { TaskSection } from "@/components/task-section";
import { TripCard } from "@/components/trip-card";
import { EmptyState } from "@/components/ui";
import { canRunFieldTrip, requireUser } from "@/lib/auth/rbac";
import { getLocale, getTranslations } from "@/lib/i18n/server";
import { projectImageSrc } from "@/lib/pictures";
import { serialiseTask, serialiseTrip } from "@/lib/serialise";
import { getSettings } from "@/lib/settings/server";
import {
  getAssignableEmployees,
  getProjectOptions,
  getProjectSummaries,
  getProjectWork,
} from "@/server/queries";

export const metadata: Metadata = { title: "โปรเจกต์ / Project" };

/**
 * One project: its scope in full, its progress, and the work in it.
 *
 * The tasks are narrowed exactly as the dashboard narrows them (see
 * getProjectWork), so this page is a second way into rows the viewer could
 * already read, never a wider one. An admin can edit and close the project
 * here, and edit the tasks in it as on /admin/tasks.
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const isAdmin = user.role === "ADMIN";

  const [t, locale, settings, [project], work, assignees, options] = await Promise.all([
    getTranslations(),
    getLocale(),
    getSettings(),
    getProjectSummaries(user, { id }),
    getProjectWork(user, id),
    isAdmin ? getAssignableEmployees() : Promise.resolve([]),
    isAdmin ? getProjectOptions() : Promise.resolve([]),
  ]);
  if (!project) notFound();

  const date = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  });

  return (
    <ProjectOptionsProvider options={options}>
      <PageShell className="space-y-8">
        <header className="space-y-4">
          <Link href="/projects" className="text-sm" style={{ color: "var(--text-muted)" }}>
            <LinkPending />
            {t("projects.back")}
          </Link>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="panel space-y-3 lg:col-span-2">
              <div className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                {project.code}
                {project.closedAt && ` · ${t("projects.closed")} ${date.format(project.closedAt)}`}
              </div>
              <h1 className="text-xl font-semibold tracking-tight break-words">{project.name}</h1>
              <div>
                <h2 className="label">{t("projects.scope")}</h2>
                <p
                  className="text-sm leading-relaxed whitespace-pre-wrap break-words"
                  style={project.scope ? undefined : { color: "var(--text-muted)" }}
                >
                  {project.scope ?? t("projects.noScope")}
                </p>
              </div>
              {isAdmin && (
                <ProjectAdminControls
                  project={{
                    id: project.id,
                    name: project.name,
                    scope: project.scope,
                    startDate: project.startDate?.toISOString() ?? null,
                    endDate: project.endDate?.toISOString() ?? null,
                    closedAt: project.closedAt?.toISOString() ?? null,
                    imageSrc: project.imageUpdatedAt
                      ? projectImageSrc(project.id, project.imageUpdatedAt)
                      : null,
                  }}
                />
              )}
            </section>

            {/* The same card the list draws, as the at-a-glance numbers. */}
            <ProjectCard project={project} t={t} locale={locale} />
          </div>
        </header>

        <TaskSection title={t("projects.activeTasks")}>
          {work.active.length === 0 ? (
            <EmptyState label={t("tasks.empty")} />
          ) : (
            <CardGrid>
              {work.active.map((task) => (
                <ActiveTaskCard
                  key={task.id}
                  task={serialiseTask(task)}
                  canMutate={isAdmin || task.assignees.some((a) => a.employee.id === user.id)}
                  isAdmin={isAdmin}
                  assignees={isAdmin ? assignees : undefined}
                />
              ))}
            </CardGrid>
          )}
        </TaskSection>

        {settings["fieldTrip.enabled"] && work.trips.length > 0 && (
          <TaskSection title={t("projects.trips")}>
            <CardGrid>
              {work.trips.map((trip) => (
                <TripCard
                  key={trip.id}
                  trip={serialiseTrip(trip, locale)}
                  canRun={canRunFieldTrip(user, {
                    travellerIds: trip.travellers.map((person) => person.id),
                  })}
                />
              ))}
            </CardGrid>
          </TaskSection>
        )}

        <TaskSection title={t("projects.completedTasks")}>
          {work.completed.length === 0 ? (
            <EmptyState label={t("tasks.empty")} />
          ) : (
            <CardGrid>
              {work.completed.map((task) => (
                <CompletedTaskCard
                  key={task.id}
                  task={serialiseTask(task)}
                  isAdmin={isAdmin}
                  assignees={isAdmin ? assignees : undefined}
                />
              ))}
            </CardGrid>
          )}
        </TaskSection>
      </PageShell>
    </ProjectOptionsProvider>
  );
}
