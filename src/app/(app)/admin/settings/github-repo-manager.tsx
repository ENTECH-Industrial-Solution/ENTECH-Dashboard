"use client";

import { useActionState } from "react";

import { Alert, SubmitButton } from "@/components/ui";
import { useTranslations } from "@/lib/i18n/client";
import { setRepoVisibilityAction } from "@/server/actions/settings";
import { idleState } from "@/server/actions/types";

/**
 * Which public repositories the dashboard's GitHub band shows. Every repo is
 * shown unless hidden here, so a new one appears without anybody's help.
 * `repos` is null when the section is off or GitHub could not be reached.
 */
export function GithubRepoManager({
  repos,
  hidden,
  unavailable,
}: {
  repos: { name: string; description: string | null }[] | null;
  hidden: string[];
  unavailable: boolean;
}) {
  const t = useTranslations();
  const [state, action] = useActionState(setRepoVisibilityAction, idleState);
  const hiddenSet = new Set(hidden);

  return (
    <section className="panel space-y-3">
      <header className="space-y-1">
        <h2 className="font-semibold tracking-tight">{t("settings.repos")}</h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("settings.reposHint")}
        </p>
      </header>

      {state.status === "success" && state.message && (
        <Alert tone="success">{state.message}</Alert>
      )}
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}

      {repos === null ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {unavailable ? t("github.unavailable") : t("settings.reposOff")}
        </p>
      ) : repos.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("github.empty")}
        </p>
      ) : (
        repos.map((repo) => {
          const isHidden = hiddenSet.has(repo.name);

          return (
            <div key={repo.name} className="card flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{repo.name}</span>
                  {isHidden && (
                    <span
                      className="badge"
                      style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}
                    >
                      {t("settings.hidden")}
                    </span>
                  )}
                </div>
                {repo.description && (
                  <p className="truncate text-sm" style={{ color: "var(--text-muted)" }}>
                    {repo.description}
                  </p>
                )}
              </div>

              <form action={action}>
                <input type="hidden" name="repo" value={repo.name} />
                <input type="hidden" name="visible" value={isHidden ? "true" : "false"} />
                <SubmitButton className={isHidden ? "btn btn-primary" : "btn btn-secondary"}>
                  {isHidden ? t("settings.show") : t("settings.hide")}
                </SubmitButton>
              </form>
            </div>
          );
        })
      )}
    </section>
  );
}
