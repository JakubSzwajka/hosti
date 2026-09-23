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
      <rect x="18" y="10" width="4" height="4" fill="currentColor" />
    </svg>
  );
}
