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
}: {
  fullName: string;
  size?: "md" | "lg";
  muted?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${
        size === "lg" ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm"
      }`}
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
