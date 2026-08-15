export const ROOM_LAYOUTS = {
  imax: { rows: 13, cols: 20, blocks: [[1, 5], [6, 15], [16, 20]] as [number, number][] },
  "2d": { rows: 12, cols: 15, blocks: [[1, 4], [5, 11], [12, 15]] as [number, number][] },
  premium: { rows: 9, cols: 10, blocks: [[1, 10]] as [number, number][] },
} as const;

/**
 * Normalize a DB room string to a ROOM_LAYOUTS key.
 * "imax" → "imax", "2d-1"/"2d-2"/any "2d*" → "2d", anything else → "premium"
 */
export function normalizeRoom(room: string): keyof typeof ROOM_LAYOUTS {
  if (room === "imax") return "imax";
  if (room.startsWith("2d")) return "2d";
  return "premium";
}
