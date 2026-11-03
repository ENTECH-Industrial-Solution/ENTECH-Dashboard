import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * A person's profile picture, served from EmployeePhoto.
 *
 * Same terms as a project's picture (see /projects/[id]/image): a route
 * handler because an `<img>` needs a URL, same-origin because the CSP opens
 * no storage host, and the session checked here because being under `(app)/`
 * grants a route handler nothing. Any signed-in employee may see any face —
 * faces are drawn on shared views like trips and projects — which is wider
 * than the page this sits under, and deliberately so: the picture says nothing
 * the person's name on the same card does not.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });

  const { id } = await params;
  const photo = await db.employeePhoto.findUnique({
    where: { employeeId: id },
    select: { image: true, imageType: true },
  });
  if (!photo) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(photo.image), {
    headers: {
      "Content-Type": photo.imageType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
