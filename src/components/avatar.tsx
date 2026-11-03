/**
 * A person's initials in a circle.
 *
 * Its own module, with no imports, so client and server components can both
 * draw one — it used to live in employee-frame.tsx, which reads the server's
 * translations and so cannot be imported from a client card.
 */

/** First letters of the first two words — works for Thai and Latin names alike. */
export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0] ?? "")
    .join("");
}

export function Avatar({
  fullName,
  size = "md",
  muted = false,
  photo = null,
}: {
  fullName: string;
  size?: "sm" | "md" | "lg";
  muted?: boolean;
  /** The person's own picture (see employeePhotoSrc); initials when null. */
  photo?: string | null;
}) {
  const box =
    size === "lg" ? "h-14 w-14 text-lg" : size === "sm" ? "h-7 w-7 text-xs" : "h-10 w-10 text-sm";
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- our own same-origin route, already downscaled on upload
      <img
        src={photo}
        alt=""
        aria-hidden
        loading="lazy"
        className={`shrink-0 rounded-full object-cover ${box}`}
        style={muted ? { filter: "grayscale(1)", opacity: 0.6 } : undefined}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${box}`}
      style={
        muted
          ? { background: "var(--surface-muted)", color: "var(--text-muted)" }
          : { background: "var(--brand-soft)", color: "var(--brand)" }
      }
    >
      {initials(fullName)}
    </span>
  );
}
