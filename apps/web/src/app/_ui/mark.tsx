/**
 * The Hosti mark: two pages linked, one bundle pointing at another.
 *
 * Hand drawn on the same 32 grid as `app/icon.svg`, with the same numbers, so
 * the two never drift. This one leaves off the icon's paper plate and takes its
 * dark ink from `currentColor`, so it sits in a line of text and follows the
 * colour that line is already in. The teal stays teal: it reads on paper and on
 * a dark ground alike, and it is the one colour the mark cannot borrow.
 *
 * Every edge is a whole pixel at 16px and at 32px, which is why the numbers are
 * what they are. Change one and check the small sizes again.
 *
 * `label` names the mark for a screen reader when it stands alone. Beside a
 * heading that already says Hosti, leave it out and the mark goes to decoration,
 * so nothing reads the name twice.
 */
export function Mark({ size = 24, label }: { size?: number; label?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      {/* The page behind, in the ink of whatever text it sits in. */}
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="4" />
      {/* The page in front, crossing over the ink at the lower left. */}
      <rect
        x="12"
        y="12"
        width="16"
        height="16"
        rx="3"
        stroke="var(--pop, #06707e)"
        strokeWidth="4"
      />
      {/* Ink back over teal at the upper right. Without this square the two
          shapes only overlap; with it they are links in a chain. */}
      <rect x="18" y="10" width="4" height="4" fill="currentColor" />
    </svg>
  );
}
