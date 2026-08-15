/**
 * Deterministic order-number generator for CinePaís demo purchases.
 *
 * Algorithm: djb2 XOR variant on UTF-16 code units, clamped to a signed
 * 32-bit integer at every step, then Math.abs → base36 → zero-padded to
 * at least 6 characters → first 6 chars → uppercase.
 *
 * Same inputs always produce the same output (deterministic). Collisions are
 * acceptable for a demo context — this is NOT cryptographic.
 */
function hash6(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
    h = h | 0; // keep as 32-bit signed integer
  }
  return Math.abs(h).toString(36).padStart(6, "0").slice(0, 6).toUpperCase();
}

/**
 * Generates a deterministic CinePaís order number for a seat selection.
 *
 * - Sorts seatIds before hashing to ensure `[A, B]` and `[B, A]` produce
 *   the same order number.
 * - Output format: `"CP-XXXXXX"` (6 uppercase base-36 characters).
 */
export function computeOrderNumber(
  showtimeId: string,
  seatIds: string[],
): string {
  const sorted = [...seatIds].sort();
  const input = showtimeId + sorted.join(",");
  return "CP-" + hash6(input);
}
