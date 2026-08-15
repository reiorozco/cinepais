import { z } from "zod";
import { FormatSchema, AreaCategorySchema } from "@/lib/api/schemas";

type Format = z.infer<typeof FormatSchema>;
type AreaCategory = z.infer<typeof AreaCategorySchema>;

/**
 * Pricing constants.
 *
 * NOTE: "Premium" (room format) and "premium" (areaCategory zone) are
 * independent axes and DO compound — a Premium-room premium-zone seat
 * uses base[Premium] × zoneMultiplier[premium].
 */
export const PRICING = {
  base: {
    IMAX: 32000,
    Onyx: 28000,
    Premium: 24000,
    "2D": 18000,
    Doblada: 18000,
    Subtitulada: 18000,
  } as const satisfies Record<Format, number>,
  zoneMultiplier: {
    general: 1.0,
    wheelchair: 1.0,
    preferential: 1.15,
    premium: 1.35,
  } as const satisfies Record<AreaCategory, number>,
  wednesdayFactor: 0.6,
  roundTo: 500,
} as const;

/** Precedence order for format resolution (highest priority first). */
const FORMAT_PRECEDENCE: readonly Format[] = [
  "IMAX",
  "Onyx",
  "Premium",
  "2D",
  "Doblada",
  "Subtitulada",
];

/**
 * Returns the dominant (highest-priority) format from a list of formats.
 * Precedence: IMAX > Onyx > Premium > 2D > Doblada > Subtitulada.
 */
export function dominantFormat(formats: Format[]): Format {
  for (const candidate of FORMAT_PRECEDENCE) {
    if (formats.includes(candidate)) return candidate;
  }
  // Unreachable if formats is non-empty and only contains valid Format values,
  // but guard defensively to satisfy exhaustiveness.
  return formats[0];
}

/**
 * Returns true when businessDate (YYYY-MM-DD) falls on a Wednesday (UTC).
 * Parses strictly as UTC midnight to avoid timezone drift.
 * The businessDate argument is mandatory — no wall-clock reads.
 */
export function isWednesday(businessDate: string): boolean {
  return new Date(`${businessDate}T00:00:00Z`).getUTCDay() === 3;
}

/**
 * Computes the seat price for a showtime.
 *
 * Formula: base[dominantFormat] × zoneMultiplier[areaCategory] × wednesdayFactor? → rounded to nearest 500.
 *
 * @param formats      - showtime formats array (single-format in current seed)
 * @param areaCategory - seat zone ("general" | "premium" | "wheelchair" | "preferential")
 * @param businessDate - showtime date as YYYY-MM-DD (UTC)
 */
export function seatPrice(
  formats: Format[],
  areaCategory: AreaCategory,
  businessDate: string,
): number {
  const base = PRICING.base[dominantFormat(formats)];
  const zone = PRICING.zoneMultiplier[areaCategory];
  const wed = isWednesday(businessDate) ? PRICING.wednesdayFactor : 1.0;
  const raw = base * zone * wed;
  return Math.round(raw / PRICING.roundTo) * PRICING.roundTo;
}
