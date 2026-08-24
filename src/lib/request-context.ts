import { headers } from "next/headers";

/** Client IP and user agent, for audit rows and rate-limit keys. */
export async function getRequestContext(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  const h = await headers();
  // Vercel sets x-forwarded-for; the left-most entry is the client.
  const forwarded = h.get("x-forwarded-for");
  const ipAddress =
    forwarded?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;

  return { ipAddress, userAgent: h.get("user-agent") };
}
