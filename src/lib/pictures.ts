/**
 * Uploaded pictures — a project's and a person's: what may be stored, how it
 * is recognised, and where it is served from.
 *
 * The browser downscales before uploading (PICTURE_SIDE, in PictureField), so
 * a real upload is tens of kilobytes; the byte ceiling is the server's own
 * backstop and sits well under the 1mb server-action body limit.
 */
export const PICTURE_SIDE = 256;
export const PICTURE_MAX_BYTES = 300_000;

export type PictureType = "image/png" | "image/jpeg" | "image/webp";

/**
 * The type by magic bytes, never by the name or the type the browser claimed.
 * Raster only: SVG is a document that can carry script, and it is refused by
 * not being on this list.
 */
export function sniffImageType(bytes: Uint8Array): PictureType | null {
  const at = (i: number) => bytes[i] ?? -1;
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/* Both URLs are versioned by the picture's timestamp, so a replaced picture
   is a new URL and the old one may be cached for good. */

export function projectImageSrc(projectId: string, updatedAt: Date | string) {
  return `/projects/${projectId}/image?v=${new Date(updatedAt).getTime()}`;
}

export function employeePhotoSrc(employeeId: string, updatedAt: Date | string) {
  return `/dashboard/employee/${employeeId}/photo?v=${new Date(updatedAt).getTime()}`;
}

/** `photo: { updatedAt }` as Prisma selects it, to the URL a face is drawn from. */
export function photoOf(employeeId: string, photo: { updatedAt: Date } | null | undefined) {
  return photo ? employeePhotoSrc(employeeId, photo.updatedAt) : null;
}
