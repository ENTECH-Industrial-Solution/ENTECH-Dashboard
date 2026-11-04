import "server-only";

import { PICTURE_MAX_BYTES, sniffImageType } from "@/lib/pictures";

/**
 * What the form asks of the picture: leave it, take it away, or replace it.
 * The file is read here rather than through Zod because `formDataToObject`
 * keeps strings only, and its type is decided by its bytes, not its name.
 */
export type ImageChange =
  | { kind: "keep" }
  | { kind: "remove" }
  | { kind: "set"; image: Uint8Array<ArrayBuffer>; imageType: string }
  | { kind: "error"; message: string };

export async function readImageChange(formData: FormData): Promise<ImageChange> {
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    if (file.size > PICTURE_MAX_BYTES) {
      return { kind: "error", message: "รูปใหญ่เกินไป / The picture is too large" };
    }
    const image = new Uint8Array(await file.arrayBuffer());
    const imageType = sniffImageType(image);
    if (!imageType) {
      return { kind: "error", message: "ใช้ได้เฉพาะรูป PNG, JPG หรือ WebP / PNG, JPG or WebP only" };
    }
    return { kind: "set", image, imageType };
  }
  return formData.get("removeImage") === "on" ? { kind: "remove" } : { kind: "keep" };
}
