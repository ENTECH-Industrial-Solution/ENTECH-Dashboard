import Link from "next/link";

import { Avatar } from "@/components/avatar";
import { LinkPending } from "@/components/nav-progress";
import { NoteStack } from "@/components/note-stack";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Translate } from "@/lib/i18n/server";
import { projectImageSrc } from "@/lib/pictures";
import type { ProjectSummary } from "@/server/queries";

/** Beyond this the faces stop and a "+n" stands for the rest, as on a trip. */
const MAX_FACES = 3;

/** The four parts of the bar, in the order they are drawn and listed. */
const PARTS = [
  { key: "done", color: "var(--success)" },
  { key: "active", color: "var(--brand)" },
  { key: "overdue", color: "var(--danger)" },
  // Mixed from the text rather than a surface token: a surface token is what
  // the card itself may be painted with, and then "not started" vanishes.
  { key: "todo", color: "color-mix(in oklch, var(--text-muted) 40%, transparent)" },
] as const;

/**
 * One project at a glance: what it is, how far along it is by status, who is
 * on it, and — beside that — its open tasks as a pile of notes (`NoteStack`),
 * the one most in need of attention facing you, each signed with who is on
 * it, so a long list costs no more room than three.
 *
 * The whole card is one link to the project's page, so the notes are a
 * preview and nothing inside them is a link of its own. They are hidden from
 * assistive tech for the same reason: the page lists the tasks properly, and
 * twenty titles read into one link's name would be noise.
 *
 * Shared by the dashboard band (inside a `SlideRow`, hence `slide-card` from
 * the caller) and the projects pages. `.card-link` sets `display: block`, so
 * the layout lives on a wrapper inside the link. The notes sit beside the
 * details only once the card is wide enough (a container query, since the
 * same card is a rail item, a grid cell and a header column); below that they
 * go underneath.
 */
export function ProjectCard({
  project,
  t,
  locale,
  className = "",
}: {
  project: ProjectSummary;
  t: Translate;
  locale: Locale;
  className?: string;
}) {
  const counts = {
    done: project.done,
    active: project.active,
    overdue: project.overdue,
    todo: Math.max(0, project.total - project.done - project.active - project.overdue),
  };
  const faces = project.people.slice(0, MAX_FACES);
  const more = project.people.length - faces.length;
  const moreNotes = project.openTasks - project.notes.length;
  const date = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  });
  const range =
    project.startDate && project.endDate
      ? date.formatRange(project.startDate, project.endDate)
      : project.startDate
        ? `${t("projects.from")} ${date.format(project.startDate)}`
        : project.endDate
          ? `${t("projects.until")} ${date.format(project.endDate)}`
          : null;

  return (
    <Link
      href={`/projects/${project.id}`}
      className={`card card-link @container p-4 ${className}`}
      style={project.closedAt ? { background: "var(--surface-muted)" } : undefined}
    >
      <LinkPending />
      <div className="grid h-full grid-cols-1 gap-4 @[26rem]:grid-cols-[minmax(0,1fr)_10.5rem]">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-3">
            {project.imageUpdatedAt && (
              // eslint-disable-next-line @next/next/no-img-element -- our own same-origin route, already downscaled on upload
              <img
                src={projectImageSrc(project.id, project.imageUpdatedAt)}
                alt=""
                loading="lazy"
                className="h-11 w-11 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0">
              <div
                className="flex items-center gap-2 font-mono text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                <span>{project.code}</span>
                {project.closedAt && (
                  <span
                    className="badge"
                    style={{ background: "var(--surface)", color: "var(--text-muted)" }}
                  >
                    {t("projects.closed")}
                  </span>
                )}
              </div>
              <h3 className="line-clamp-2 font-medium leading-snug break-words">{project.name}</h3>
            </div>
          </div>
          {project.scope && (
            <p
              className="line-clamp-2 text-sm leading-relaxed whitespace-pre-line"
              style={{ color: "var(--text-muted)" }}
            >
              {project.scope}
            </p>
          )}

          <div className="mt-auto space-y-2.5 pt-2">
            {project.total === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {t("projects.noWork")}
              </p>
            ) : (
              <>
                <div
                  className="flex h-2 gap-0.5 overflow-hidden rounded-full"
                  role="img"
                  aria-label={`${project.done}/${project.total} ${t("projects.done")}`}
                >
                  {PARTS.map(
                    (part) =>
                      counts[part.key] > 0 && (
                        <span
                          key={part.key}
                          className="h-full"
                          style={{ flexGrow: counts[part.key], background: part.color }}
                        />
                      ),
                  )}
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
                  <span>
                    <span className="font-semibold">
                      {project.done}/{project.total}
                    </span>{" "}
                    <span style={{ color: "var(--text-muted)" }}>{t("projects.done")}</span>
                  </span>
                  {PARTS.slice(1).map(
                    (part) =>
                      counts[part.key] > 0 && (
                        <span
                          key={part.key}
                          className="inline-flex items-center gap-1"
                          style={{
                            color: part.key === "overdue" ? "var(--danger)" : "var(--text-muted)",
                          }}
                        >
                          <span
                            aria-hidden
                            className="h-2 w-2 rounded-full"
                            style={{ background: part.color }}
                          />
                          {t(`projects.${part.key}`)} {counts[part.key]}
                        </span>
                      ),
                  )}
                </p>
              </>
            )}

            {(faces.length > 0 || range) && (
              <div className="flex items-center gap-3">
                {faces.length > 0 && (
                  <div className="flex shrink-0 -space-x-1.5">
                    {faces.map((person) => (
                      <span
                        key={person.id}
                        className="rounded-full ring-2"
                        style={{ "--tw-ring-color": "var(--surface)" } as React.CSSProperties}
                        title={`${person.employeeCode} — ${person.fullName}`}
                      >
                        <Avatar fullName={person.fullName} size="sm" photo={person.photo} />
                      </span>
                    ))}
                    {more > 0 && (
                      <span
                        aria-hidden
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[0.65rem] font-semibold ring-2"
                        style={
                          {
                            "--tw-ring-color": "var(--surface)",
                            background: "var(--surface-muted)",
                            color: "var(--text-muted)",
                          } as React.CSSProperties
                        }
                      >
                        +{more}
                      </span>
                    )}
                  </div>
                )}
                {range && (
                  <span className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                    {range}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {project.notes.length > 0 && (
          <NoteStack notes={project.notes} more={moreNotes} />
        )}
      </div>
    </Link>
  );
}
