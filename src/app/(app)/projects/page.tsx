import type { Metadata } from "next";

import { PageShell } from "@/components/page-shell";
import { ProjectCard } from "@/components/project-card";
import { ProjectCreator, ProjectMoveButtons } from "@/components/project-form";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth/rbac";
import { getLocale, getTranslations } from "@/lib/i18n/server";
import { getProjectSummaries } from "@/server/queries";

export const metadata: Metadata = { title: "โปรเจกต์ / Projects" };

/**
 * Every project, open ones first and closed ones under their own heading.
 * Readable by anyone signed in; only an admin sees the button that makes one.
 * The progress on each card is the caller's share of it — see
 * getProjectSummaries.
 */
export default async function ProjectsPage() {
  const user = await requireUser();
  const [t, locale, projects] = await Promise.all([
    getTranslations(),
    getLocale(),
    getProjectSummaries(user),
  ]);

  const open = projects.filter((p) => p.closedAt === null);
  const closed = projects.filter((p) => p.closedAt !== null);

  // Only open projects are ordered by hand: closed ones are out of the band.
  const grid = (list: typeof projects, movable = false) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((project, i) =>
        movable ? (
          <div key={project.id} className="flex flex-col gap-2">
            <ProjectCard project={project} t={t} locale={locale} className="flex-1" />
            <ProjectMoveButtons
              projectId={project.id}
              first={i === 0}
              last={i === list.length - 1}
            />
          </div>
        ) : (
          <ProjectCard key={project.id} project={project} t={t} locale={locale} />
        ),
      )}
    </div>
  );

  return (
    <PageShell className="space-y-8">
      <header className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t("projects.title")}</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {t("projects.hint")}
          </p>
        </div>
        {user.role === "ADMIN" && <ProjectCreator />}
      </header>

      {open.length === 0 ? (
        <EmptyState label={t("projects.empty")} />
      ) : (
        grid(open, user.role === "ADMIN")
      )}

      {closed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">{t("projects.closedHeading")}</h2>
          {grid(closed)}
        </section>
      )}
    </PageShell>
  );
}
