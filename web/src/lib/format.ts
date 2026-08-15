const COP_FORMATTER = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/**
 * Formats a number as Colombian pesos (COP) using the es-CO locale.
 *
 * Output example: "$\u00a018.000" — the separator is U+00A0 (NBSP), not a plain space.
 */
export function formatCOP(n: number): string {
  return COP_FORMATTER.format(n);
}
