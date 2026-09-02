import { redirect } from "next/navigation";

import { AppNav } from "@/components/app-nav";
import { requireUser } from "@/lib/auth/rbac";
import { SettingsProvider } from "@/lib/settings/client";
import { getSettings } from "@/lib/settings/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // A temporary password must be replaced before any real page is reachable.
  if (user.mustChangePassword) redirect("/change-password");

  // Provided once here rather than drilled through every page: the task cards
  // are client components and each one consults these switches.
  const settings = await getSettings();

  // The `<main>` lives in each page now, not here — see PageShell. The layout
  // contributes only the header and a full-height flex column, so a page that
  // wants the whole viewport (the customer map) can take `flex-1` and have it,
  // while every other page renders a PageShell and looks exactly as before.
  return (
    <SettingsProvider settings={settings}>
      <div className="flex min-h-dvh flex-col">
        <AppNav user={user} />
        {children}
      </div>
    </SettingsProvider>
  );
}
