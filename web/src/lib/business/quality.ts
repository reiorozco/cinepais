/**
 * Maps a 1-indexed row number to a quality tier.
 * Rows 1-3: low, rows 4-8: optimal, rows 9+: high.
 * Adjusted proportionally for smaller rooms.
 */
export function rowToTier(
  row: number,
  maxRow: number
): "low" | "optimal" | "high" {
  // Proportional mapping: bottom 23% = low, middle 38% = optimal, top 39% = high
  const pct = row / maxRow;
  if (pct <= 0.23) return "low";
  if (pct <= 0.62) return "optimal";
  return "high";
}
