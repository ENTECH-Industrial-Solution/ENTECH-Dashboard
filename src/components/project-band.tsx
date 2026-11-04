import Link from "next/link";

import { LinkPending } from "@/components/nav-progress";
import { ProjectCard } from "@/components/project-card";
import { SlideRow } from "@/components/slide-row";
import { getLocale, getTranslations } from "@/lib/i18n/server";
import type { ProjectSummary } from "@/server/queries";

/**
 * The open projects, above the calendar: each one's scope and progress in a
 * row that runs sideways, with the way through to every project at the end of
 * the heading. The page fetches the summaries, so this costs no read of its
 * own, and `dashboard.showProjects` skips that read rather than this markup.
 */
export async function ProjectBand({ projects }: { projects: ProjectSummary[] }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  return (
    <section className="panel space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t("projects.title")}</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {t("projects.bandHint")}
          </p>
        </div>
        <Link href="/projects" className="text-sm font-medium" style={{ color: "var(--brand)" }}>
          <LinkPending />
          {t("projects.viewAll")} →
        </Link>
      </header>

      {projects.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("projects.empty")}
        </p>
      ) : (
        <SlideRow
          label={t("projects.title")}
          rows={1}
          heading={
            <div
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--text-muted)" }}
            >
              {projects.length} {t("projects.title")}
            </div>
          }
        >
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              t={t}
              locale={locale}
              className="slide-card row-span-full"
            />
          ))}
        </SlideRow>
      )}
    </section>
  );
}
