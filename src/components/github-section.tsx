import { SlideRow } from "@/components/slide-row";
import { getGithubOverview } from "@/lib/github";
import { getLocale, getTranslations } from "@/lib/i18n/server";
import { getHiddenRepos } from "@/lib/settings/server";

/** One track: a repo box is a single link, so there are no parts to align. */
const BOX_ROWS = 1;

/**
 * The organisation's GitHub profile and its public repositories, as one band.
 *
 * The caller gates it on `github.enabled` before rendering, so a switched-off
 * section never reaches GitHub. It renders in the page's own pass rather than
 * behind a Suspense boundary: SlideRow measures itself after every render, and
 * inside a streamed boundary that measurement re-rendered forever. The fetch's
 * timeout in lib/github.ts is what keeps a slow GitHub from holding the page.
 */
export async function GithubSection() {
  const [t, locale, overview, hidden] = await Promise.all([
    getTranslations(),
    getLocale(),
    getGithubOverview(),
    getHiddenRepos(),
  ]);

  if (!overview) {
    return (
      <section className="panel">
        <h2 className="text-lg font-semibold tracking-tight">{t("github.title")}</h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("github.unavailable")}
        </p>
      </section>
    );
  }

  const { org } = overview;
  const repos = overview.repos.filter((repo) => !hidden.has(repo.name));
  const date = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  });

  return (
    <section className="panel space-y-4">
      <header className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            <a
              href={org.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2"
            >
              {/* GitHub's mark, inline so it needs no img-src host. */}
              <svg width={20} height={20} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
              </svg>
              {org.name ?? org.login}
            </a>
          </h2>
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {t("github.title")} · {org.public_repos} {t("github.repos")}
          </span>
        </div>

        {org.description && <p className="text-sm">{org.description}</p>}

        {(org.location || org.blog) && (
          <p
            className="flex flex-wrap gap-x-3 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {org.location && <span>{org.location}</span>}
            {org.blog && (
              <a
                href={/^https?:\/\//.test(org.blog) ? org.blog : `https://${org.blog}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {org.blog}
              </a>
            )}
          </p>
        )}
      </header>

      {repos.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {t("github.empty")}
        </p>
      ) : (
        <SlideRow
          label={t("github.title")}
          rows={BOX_ROWS}
          heading={
            <div
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--text-muted)" }}
            >
              {repos.length} {t("github.repos")}
            </div>
          }
        >
          {repos.map((repo) => (
            <a
              key={repo.name}
              href={repo.html_url}
              target="_blank"
              rel="noopener noreferrer"
              title={t("github.viewOnGithub")}
              className="card card-link slide-card row-span-full p-3"
            >
              {/* .card-link sets display: block, so the layout lives on a
                  wrapper inside the link — see Conventions in CLAUDE.md. */}
              <div className="flex h-full flex-col gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{repo.name}</span>
                  {repo.archived && (
                    <span
                      className="badge shrink-0"
                      style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}
                    >
                      {t("github.archived")}
                    </span>
                  )}
                  {repo.fork && (
                    <span
                      className="badge shrink-0"
                      style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}
                    >
                      {t("github.fork")}
                    </span>
                  )}
                </div>

                <p
                  className="line-clamp-2 text-sm"
                  style={{ color: repo.description ? undefined : "var(--text-muted)" }}
                >
                  {repo.description || t("github.noDescription")}
                </p>

                <p
                  className="mt-auto flex flex-wrap gap-x-3 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {repo.language && <span>{repo.language}</span>}
                  <span>★ {repo.stargazers_count}</span>
                  {repo.pushed_at && (
                    <span>
                      {t("github.pushed")} {date.format(new Date(repo.pushed_at))}
                    </span>
                  )}
                </p>
              </div>
            </a>
          ))}
        </SlideRow>
      )}
    </section>
  );
}
