interface BrandMarkProps {
  /** 16–24 in UI chrome; the lockup is a separate asset. */
  size?: number;
}

/** Inlined rather than an <img>: an <img> cannot inherit currentColor, and the
 *  mark has to read as accent in one place and as text colour in another.
 *
 *  The svg is aria-hidden because the mark normally sits beside the product
 *  name, which already carries it. Used alone — inside an icon button, say —
 *  nothing here names it, so the button needs the aria-label itself. */
export function BrandMark({ size = 20 }: BrandMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* Copied verbatim from assets/effi-mark.svg, which stays the master.
          Five filled quadrilaterals, no strokes — the counters are ~1.75px
          at the 16px minimum, so a stroke-based construction closes them. */}
      <path fill="currentColor" d="M8.16 1.5L23.84 1.5L20.07 6.76L4.22 6.76Z" />
      <path fill="currentColor" d="M2.49 6.76L8.62 6.76L6.66 9.38L0.53 9.38Z" />
      <path fill="currentColor" d="M6.46 9.38L19.07 9.38L14.92 14.63L2.3 14.63Z" />
      <path fill="currentColor" d="M2.33 14.63L8.37 14.63L6.39 17.27L0.35 17.27Z" />
      <path fill="currentColor" d="M0.37 17.27L20.19 17.27L23.98 22.52L5.38 22.52Z" />
    </svg>
  );
}
