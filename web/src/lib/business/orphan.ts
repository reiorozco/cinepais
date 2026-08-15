export type SeatStatus = "Available" | "Sold";

/**
 * Returns true if the proposed selection would leave exactly one Available seat
 * isolated between Sold/selected seats, aisles, or row edges on both sides.
 *
 * @param rowAvailability - Current status of each seat in the row (0-indexed)
 * @param selection - 0-indexed column numbers to select (will become Sold)
 * @param aisleCols - Column indexes that are aisles (treated as walls/edges)
 */
export function wouldLeaveOrphan(
  rowAvailability: SeatStatus[],
  selection: number[],
  aisleCols: Set<number>
): boolean {
  const selSet = new Set(selection);
  const n = rowAvailability.length;

  // Build the post-selection state: selected seats become Sold
  const postState: SeatStatus[] = rowAvailability.map((s, i) =>
    selSet.has(i) ? "Sold" : s
  );

  // Find contiguous groups of Available seats separated by Sold/aisle/edge
  // A group of exactly 1 Available seat is an orphan
  let i = 0;
  while (i < n) {
    if (postState[i] === "Available" && !aisleCols.has(i)) {
      // Start of an Available group
      const groupStart = i;
      let groupEnd = i;
      while (
        groupEnd + 1 < n &&
        postState[groupEnd + 1] === "Available" &&
        !aisleCols.has(groupEnd + 1)
      ) {
        groupEnd++;
      }
      const groupSize = groupEnd - groupStart + 1;
      if (groupSize === 1) {
        return true; // orphan found
      }
      i = groupEnd + 1;
    } else {
      i++;
    }
  }
  return false;
}
