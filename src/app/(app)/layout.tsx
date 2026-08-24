import { redirect } from "next/navigation";

import { AppNav } from "@/components/app-nav";
import { requireUser } from "@/lib/auth/rbac";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // A temporary password must be replaced before any real page is reachable.
  if (user.mustChangePassword) redirect("/change-password");

  return (
    <div className="min-h-dvh">
      <AppNav user={user} />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
