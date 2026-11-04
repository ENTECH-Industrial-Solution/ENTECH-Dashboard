import Link from "next/link";

import { LinkPending } from "@/components/nav-progress";
import type { ProjectRef } from "@/lib/projects";

/**
 * The project a task or trip belongs to, as a link to the project's page.
 * Drawn on cards from both sides of the client boundary, so it holds no state
 * and reads no translations — the code and the name say what it is.
 */
export function ProjectChip({ project }: { project: ProjectRef }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium hover:underline"
      style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
      title={`${project.code} · ${project.name}`}
    >
      <LinkPending />
      <span className="shrink-0 font-mono">{project.code}</span>
      <span className="truncate">{project.name}</span>
    </Link>
  );
}
