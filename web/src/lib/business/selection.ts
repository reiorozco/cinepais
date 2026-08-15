import { wouldLeaveOrphan } from "@/lib/business/orphan";
import type { SeatStatus } from "@/lib/business/orphan";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SeatForSelection = {
  seatId: string;
  col: number;    // 1-based
  row: number;    // 1-based
  status: SeatStatus;
  areaCategory: string;
};

export type SelectionState = {
  showtimeId: string | null;
  selectedSeatIds: Set<string>;
  error: "max" | "orphan" | null;
};

export type SelectionAction =
  | {
      type: "toggle";
      showtimeId: string;
      seat: SeatForSelection;
      /** All seats in the same row as seat (used for orphan check). 1-based cols. */
      rowSeats: SeatForSelection[];
      /** 1-based inclusive block ranges for the room, e.g. [[1,5],[6,15],[16,20]] */
      blocks: [number, number][];
    }
  | { type: "clear" };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SEATS = 4;

const EMPTY_STATE: SelectionState = {
  showtimeId: null,
  selectedSeatIds: new Set(),
  error: null,
};

// ---------------------------------------------------------------------------
// Pure reducer
// ---------------------------------------------------------------------------

/**
 * Pure seat-selection reducer.
 *
 * Business rules:
 *   (a) max 4 seats per purchase — 5th toggle returns state + error "max"
 *   (b) orphan check per block — each block is checked independently;
 *       block boundaries act as walls (aisleCols is always empty Set)
 *   (c) toggling off is always allowed (no orphan check on deselect)
 *   (d) dedup by seatId (toggle = add or remove)
 *   (e) showtimeId mismatch → clear existing selection first
 *
 * INDEXING CONTRACT
 *   - seat.col / rowSeats[].col are 1-based
 *   - wouldLeaveOrphan arrays are 0-based
 *   - blocks [start, end] are 1-based inclusive
 *   - slice = rowStatuses.slice(start - 1, end)  → 0-based half-open covering cols start..end
 *   - block-local index = col - start             → 0-based within the slice
 *
 * WHEELCHAIR EXEMPTION
 *   Seats with areaCategory === "wheelchair" are treated as "Sold" in the
 *   orphan check regardless of their real status. They are reserved-purpose
 *   seats and must not participate in adjacency economics.
 */
export function selectionReducer(
  state: SelectionState,
  action: SelectionAction,
): SelectionState {
  if (action.type === "clear") return EMPTY_STATE;

  const { showtimeId, seat, rowSeats, blocks } = action;

  // Rule (e): showtime changed → clear then re-apply in one step
  if (state.showtimeId !== null && state.showtimeId !== showtimeId) {
    return selectionReducer({ ...EMPTY_STATE, showtimeId }, action);
  }

  const isAlreadySelected = state.selectedSeatIds.has(seat.seatId);

  // Rule (c): deselect always succeeds, no orphan check needed
  if (isAlreadySelected) {
    const next = new Set(state.selectedSeatIds);
    next.delete(seat.seatId);
    return { showtimeId, selectedSeatIds: next, error: null };
  }

  // Rule (a): max 4
  if (state.selectedSeatIds.size >= MAX_SEATS) {
    return { showtimeId, selectedSeatIds: state.selectedSeatIds, error: "max" };
  }

  // Build the candidate set (existing selected + the new seat)
  const candidateIds = new Set(state.selectedSeatIds);
  candidateIds.add(seat.seatId);

  // Build rowStatuses array (0-based, index = col - 1).
  // Wheelchair seats → "Sold" regardless of real status (exemption).
  const maxCol = Math.max(...rowSeats.map((s) => s.col));
  const rowStatuses: SeatStatus[] = Array.from({ length: maxCol }, () => "Sold");
  for (const s of rowSeats) {
    rowStatuses[s.col - 1] =
      s.areaCategory === "wheelchair" ? "Sold" : s.status;
  }

  // Determine which 1-based cols are candidates (selected in this row + new seat)
  // Cross-reference via rowSeats to avoid parsing seatId format.
  const selectedInRow = rowSeats
    .filter((s) => state.selectedSeatIds.has(s.seatId))
    .map((s) => s.col);
  const candidateCols = [...selectedInRow, seat.col];

  // Rule (b): orphan check per block — blocks are independent walls
  for (const [start, end] of blocks) {
    // 0-based half-open slice: cols start..end inclusive
    const slice = rowStatuses.slice(start - 1, end);

    // Block-local 0-based indices for candidates in this block
    const localSelection = candidateCols
      .filter((c) => c >= start && c <= end)
      .map((c) => {
        const localIdx = c - start;
        console.assert(
          localIdx >= 0 && localIdx < slice.length,
          "block-local index out of range",
          { c, start, end, localIdx, sliceLen: slice.length },
        );
        return localIdx;
      });

    if (wouldLeaveOrphan(slice, localSelection, new Set())) {
      return { showtimeId, selectedSeatIds: state.selectedSeatIds, error: "orphan" };
    }
  }

  return { showtimeId, selectedSeatIds: candidateIds, error: null };
}
