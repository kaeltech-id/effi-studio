interface BrandMarkProps {
  /** 16–24 in UI chrome; the lockup is a separate asset. */
  size?: number;
}

/** Inlined rather than an <img>: an <img> cannot inherit currentColor, and the
 *  mark has to read as copper in one place and as text colour in another.
 *
 *  The svg is aria-hidden because the mark normally sits beside the product
 *  name, which already carries it. Used alone — inside an icon button, say —
 *  nothing here names it, so the button needs the aria-label itself. */
export function BrandMark({ size = 20 }: BrandMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* Copied verbatim from assets/effi-mark.svg, which stays the master.
          The stroke attributes were tuned for 16px legibility — the counters
          are only 2-2.7px there, so a cap or join change closes them up. */}
      <path
        d="M21 4H8L4 8v8l4 4h13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        strokeMiterlimit="4"
      />
      <path
        d="M8 9h8M8 15h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        strokeMiterlimit="4"
      />
      <path d="M18 10.5h3v3h-3z" fill="currentColor" />
    </svg>
  );
}
