import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * A project's picture, served from its row.
 *
 * A route handler because an `<img>` needs a URL, and same-origin because the
 * CSP's `img-src` opens no storage host and should not start to. Being under
 * `(app)/` grants it nothing — the layout does not run for a route handler —
 * so the session is checked here. Any signed-in employee may see it, as they
 * may read the project's name.
 *
 * The type sent is the one sniffed from the bytes on upload, never one a
 * browser claimed, and `nosniff` (set for every response in next.config.ts)
 * stops the reader second-guessing it. The URL carries `?v=<imageUpdatedAt>`,
 * so a response can be cached for good: a new picture is a new URL.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });

  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id },
    select: { image: true, imageType: true },
  });
  if (!project?.image || !project.imageType) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(project.image), {
    headers: {
      "Content-Type": project.imageType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
