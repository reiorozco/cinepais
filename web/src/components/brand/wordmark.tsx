type WordmarkProps = {
  className?: string;
};

/**
 * CinePaís wordmark: film-reel glyph + bold text.
 *
 * Server component. All strokes/fills use `currentColor`, so the wordmark
 * inherits its color from the surrounding text (white on the dark header,
 * dark on light surfaces). The parent controls color; this component
 * controls shape and rhythm.
 */
export function Wordmark({ className }: WordmarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 168 32"
      role="img"
      aria-label="CinePaís"
      className={className}
    >
      {/* Film-reel glyph: outer ring + center + 8 sprocket dots */}
      <circle
        cx="16"
        cy="16"
        r="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <g fill="currentColor">
        <circle cx="16" cy="16" r="2.6" />
        <circle cx="16" cy="6.4" r="1.9" />
        <circle cx="16" cy="25.6" r="1.9" />
        <circle cx="6.4" cy="16" r="1.9" />
        <circle cx="25.6" cy="16" r="1.9" />
        <circle cx="22.79" cy="9.21" r="1.6" />
        <circle cx="9.21" cy="22.79" r="1.6" />
        <circle cx="22.79" cy="22.79" r="1.6" />
        <circle cx="9.21" cy="9.21" r="1.6" />
      </g>
      {/* Wordmark: bold, tight-tracked, uses Geist via CSS var if available */}
      <text
        x="40"
        y="22.5"
        fill="currentColor"
        fontSize="20"
        fontWeight="700"
        style={{
          fontFamily:
            "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
          letterSpacing: "-0.02em",
        }}
      >
        CinePaís
      </text>
    </svg>
  );
}
