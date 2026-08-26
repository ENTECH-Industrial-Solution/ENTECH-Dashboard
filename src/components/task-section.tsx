import type { ReactNode } from "react";

/**
 * One of the two sections the system exists to provide, drawn as a framed
 * panel: heading, optional hint, the task cards, and an optional footnote.
 *
 * Shared by the dashboard, a person's page, and the admin task list so the two
 * sections look the same wherever they appear.
 */
export function TaskSection({
  title,
  hint,
  footnote,
  children,
}: {
  title: string;
  hint?: string;
  footnote?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel space-y-4">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {hint && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {hint}
          </p>
        )}
      </header>

      {children}

      {footnote && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {footnote}
        </p>
      )}
    </section>
  );
}
