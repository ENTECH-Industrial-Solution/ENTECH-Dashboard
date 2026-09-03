import Image from "next/image";

/**
 * The ENTECH wordmark, and the lockup it sits in.
 *
 * What the UI draws is *derived* from the artwork in `public/brand/`, not the
 * artwork itself, and each of the two changes earns its place:
 *
 * - `entech-wordmark.png` is the "ENTECH" lettering cropped out of
 *   `entech-logo.png`. The "Where Solutions Begin" line under it is about 5px
 *   tall at the size a header can give a logo, which is noise rather than a
 *   tagline.
 * - The white plate behind that lettering is keyed out to transparency. The
 *   original is blue ink on an *opaque* white rectangle — invisible on the light
 *   theme and a white slab on the dark one. Keying it lets one asset read on
 *   both, which is what every other colour in this app gets from being a token.
 *
 * The tab icon (`src/app/icon.png`) comes from the same place: `entech-icon.png`
 * trimmed to its ink and re-centred, because the original leaves a fifth of the
 * canvas empty on each side and a favicon is 16px to start with.
 *
 * `scripts/derive-brand.mjs` regenerates both. The originals in `public/brand/`
 * are the source and stay untouched — re-derive from them rather than editing a
 * derived file.
 *
 * The word beside the mark is real text, not part of the image: it is the one
 * word here that is not the brand, and it stays selectable, searchable and
 * translatable. The mark's `alt` supplies "ENTECH", so the pair reads as
 * "ENTECH Dashboard" to a screen reader.
 */

const WORDMARK_WIDTH = 292;
const WORDMARK_HEIGHT = 30;

/**
 * Sized in `em` by the caller so one component serves the 16px header and the
 * 20px login heading without either naming a pixel height.
 */
export function BrandWordmark({
  className = "h-[0.875em] w-auto",
}: {
  className?: string;
}) {
  return (
    <Image
      src="/brand/entech-wordmark.png"
      width={WORDMARK_WIDTH}
      height={WORDMARK_HEIGHT}
      // Above the fold in a sticky header on every page; lazy-loading it would
      // only ever show its absence.
      priority
      alt="ENTECH"
      className={className}
    />
  );
}

/** Mark plus the product word, on one line. */
export function BrandLockup({
  product,
  className = "",
}: {
  product: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <BrandWordmark className="h-[0.875em] w-auto shrink-0" />
      <span className="font-semibold tracking-tight">{product}</span>
    </span>
  );
}
