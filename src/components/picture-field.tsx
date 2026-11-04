"use client";

import { useEffect, useState, type ChangeEvent } from "react";

import { FieldError } from "@/components/ui";
import { useTranslations } from "@/lib/i18n/client";
import { PICTURE_SIDE } from "@/lib/pictures";

/**
 * A picture input, for a project and for a person alike: posts `image`, and
 * `removeImage` when the current one is ticked away.
 *
 * The chosen file is shrunk here, to PICTURE_SIDE on
 * its longer side, and swapped back into the input before the form posts — so
 * a 6MB phone photo goes up as a few dozen kilobytes and never meets the
 * server action's body limit. A file the browser cannot decode (HEIC on most
 * desktops) is refused here with a sentence rather than at the server.
 */
export function PictureField({
  id,
  label,
  current,
  error,
  round = false,
}: {
  id: string;
  label: string;
  current: string | null;
  error?: string;
  /** A face is drawn in a circle everywhere else, so its preview is one too. */
  round?: boolean;
}) {
  const t = useTranslations();
  const [picked, setPicked] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => () => {
    if (picked) URL.revokeObjectURL(picked);
  }, [picked]);

  async function shrink(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    setProblem(null);
    if (!file) {
      setPicked(null);
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, PICTURE_SIDE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      // A browser without a WebP encoder hands back PNG instead; both are allowed.
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.85),
      );
      if (!blob) throw new Error("encode");
      const files = new DataTransfer();
      files.items.add(new File([blob], "picture", { type: blob.type }));
      input.files = files.files;
      setPicked(URL.createObjectURL(blob));
      setRemove(false);
    } catch {
      input.value = "";
      setPicked(null);
      setProblem(t("picture.unreadable"));
    }
  }

  const shown = picked ?? (remove ? null : current);
  const shape = round ? "rounded-full" : "rounded-lg";

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label} <span style={{ opacity: 0.7 }}>({t("common.optional")})</span>
      </label>
      <div className="flex items-center gap-3">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- a blob: preview or our own same-origin route; nothing for next/image to optimise
          <img src={shown} alt="" className={`h-14 w-14 shrink-0 object-cover ${shape}`} />
        ) : (
          <span
            aria-hidden
            className={`h-14 w-14 shrink-0 ${shape}`}
            style={{ background: "var(--surface-muted)" }}
          />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <input
            id={id}
            name="image"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="input"
            onChange={shrink}
          />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {t("picture.hint")}
          </p>
          {current && !picked && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="removeImage"
                checked={remove}
                onChange={(event) => setRemove(event.currentTarget.checked)}
              />
              {t("picture.remove")}
            </label>
          )}
        </div>
      </div>
      <FieldError message={problem ?? error} />
    </div>
  );
}
