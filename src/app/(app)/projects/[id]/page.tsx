import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CardGrid } from "@/components/card-grid";
import { LinkPending } from "@/components/nav-progress";
import { PageShell } from "@/components/page-shell";
import { ProjectProgress } from "@/components/project-card";
import { ProjectAdminControls } from "@/components/project-form";
import { ProjectMindMap, type MindBranch, type MindLeaf } from "@/components/project-mind-map";
import { PartCreator } from "@/components/project-parts";
import { ProjectOptionsProvider } from "@/components/project-picker";
import { ActiveTaskCard, CompletedTaskCard } from "@/components/task-card";
import { TaskSection } from "@/components/task-section";
import { TripCard } from "@/components/trip-card";
import { EmptyState } from "@/components/ui";
import { canRunFieldTrip, requireUser } from "@/lib/auth/rbac";
import { dueState, todayKey } from "@/lib/calendar";
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
 * One project: its scope and progress, a map of its sub-projects and the work
 * in each, and the work itself.
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
  const image = project.imageUpdatedAt
    ? projectImageSrc(project.id, project.imageUpdatedAt)
    : null;
  const tripsShown = settings["fieldTrip.enabled"];

  /*
   * The map's leaves are the same rows the lists below draw, so it shows
   * nothing the viewer could not already read. Cancelled trips are left off,
   * as the calendar leaves them off: they did not happen.
   */
  const today = todayKey();
  const filed: { partId: string | null; leaf: MindLeaf }[] = [
    ...[...work.active, ...work.completed].map((task) => ({
      partId: task.part?.id ?? null,
      leaf: {
        kind: "task" as const,
        id: task.id,
        code: task.code,
        title: task.title,
        status: task.status,
        late:
          task.status !== "COMPLETED" &&
          task.dueDate !== null &&
          dueState(task.dueDate, today) === "overdue",
      },
    })),
    ...(tripsShown ? work.trips : [])
      .filter((trip) => trip.cancelledAt === null)
      .map((trip) => ({
        partId: trip.part?.id ?? null,
        leaf: {
          kind: "trip" as const,
          id: trip.id,
          title: trip.purpose,
          startedAt: trip.startedAt?.toISOString() ?? null,
          completedAt: trip.completedAt?.toISOString() ?? null,
          late: trip.completedAt === null && dueState(trip.endDate, today) === "overdue",
        },
      })),
  ];
  const partIds = new Set(project.parts.map((part) => part.id));
  const unfiled = filed.filter((row) => row.partId === null || !partIds.has(row.partId));
  const branches: MindBranch[] = [
    ...project.parts.map((part) => ({
      id: part.id,
      name: part.name,
      parentId: part.parentId,
      floating: part.floating,
      leaves: filed.filter((row) => row.partId === part.id).map((row) => row.leaf),
    })),
    ...(unfiled.length > 0
      ? [
          {
            id: null,
            name: t("parts.unfiled"),
            parentId: null,
            floating: false,
            leaves: unfiled.map((row) => row.leaf),
          },
        ]
      : []),
  ];
  const canEditParts = isAdmin && project.closedAt === null;

  return (
    <ProjectOptionsProvider options={options}>
      <PageShell className="space-y-8">
        <header className="space-y-4">
          <Link href="/projects" className="text-sm" style={{ color: "var(--text-muted)" }}>
            <LinkPending />
            {t("projects.back")}
          </Link>

          {/* One panel: what the project is on the left, how far along it is on
              the right. The card's note pile is left off here — the map below
              shows every task, filed by sub-project. */}
          <section className="panel grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-3">
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
                    imageSrc: image,
                  }}
                />
              )}
            </div>

            <div
              className="flex flex-col gap-4 border-t pt-4 lg:border-t-0 lg:border-s lg:ps-6 lg:pt-0"
              style={{ borderColor: "var(--border)" }}
            >
              {image && (
                // eslint-disable-next-line @next/next/no-img-element -- our own same-origin route, already downscaled on upload
                <img src={image} alt="" className="h-16 w-16 rounded-xl object-cover" />
              )}
              <ProjectProgress project={project} t={t} locale={locale} className="space-y-2.5" />
            </div>
          </section>
        </header>

        <TaskSection title={t("projects.map")} hint={t("projects.mapHint")}>
          {canEditParts && <PartCreator projectId={project.id} />}
          {canEditParts && project.parts.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {t("parts.noParts")}
            </p>
          )}
          <ProjectMindMap
            root={{ id: project.id, code: project.code, name: project.name, image }}
            branches={branches}
            editable={canEditParts}
          />
        </TaskSection>

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

        {tripsShown && work.trips.length > 0 && (
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
