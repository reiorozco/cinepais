/**
 * Returns true if the showtime is still purchasable (starts more than marginMinutes from now).
 * Always pass `now` explicitly — never use module-scope new Date().
 */
export function isPurchasable(
  showtimeStart: Date,
  now: Date,
  marginMinutes = 15
): boolean {
  const diffMs = showtimeStart.getTime() - now.getTime();
  return diffMs > marginMinutes * 60 * 1000;
}
