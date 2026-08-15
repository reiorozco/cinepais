import { z } from "zod";

export const CitySchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const FormatSchema = z.enum([
  "IMAX",
  "Onyx",
  "2D",
  "Doblada",
  "Subtitulada",
  "Premium",
]);

export const FilmSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  posterUrl: z.string(),
  durationMin: z.number().int(),
  rating: z.string(),
  genres: z.array(z.string()),
});

export const FilmDetailSchema = FilmSummarySchema.extend({
  synopsis: z.string(),
  director: z.string(),
  cast: z.array(z.string()),
});

export const ShowtimeSchema = z.object({
  id: z.string(),
  filmId: z.string(),
  siteId: z.string(),
  siteName: z.string(),
  city: z.string(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  room: z.string(),
  formats: z.array(FormatSchema),
});

export const AreaCategorySchema = z.enum([
  "general",
  "premium",
  "wheelchair",
  "preferential",
]);

export const QualityTierSchema = z.enum(["low", "optimal", "high"]);

export const SeatStatusSchema = z.enum(["Available", "Sold"]);

export const SeatSchema = z.object({
  seatId: z.string(),
  row: z.number().int(),
  col: z.number().int(),
  area: z.number().int(),
  status: SeatStatusSchema,
  areaCategory: AreaCategorySchema,
  qualityTier: QualityTierSchema,
});

export const AreaCountSchema = z.object({
  total: z.number().int(),
  available: z.number().int(),
});

export const SeatSummarySchema = z.object({
  totalCount: z.number().int(),
  availableCount: z.number().int(),
  byArea: z.object({
    general: AreaCountSchema,
    premium: AreaCountSchema,
    wheelchair: AreaCountSchema,
    preferential: AreaCountSchema,
  }),
});

export const ShowtimeSeatsResponseSchema = z.object({
  showtime: ShowtimeSchema,
  seats: z.array(SeatSchema),
  summary: SeatSummarySchema,
});

// Type exports
export type City = z.infer<typeof CitySchema>;
export type Film = z.infer<typeof FilmSummarySchema>;
export type FilmDetail = z.infer<typeof FilmDetailSchema>;
export type Showtime = z.infer<typeof ShowtimeSchema>;
export type Seat = z.infer<typeof SeatSchema>;
export type SeatSummary = z.infer<typeof SeatSummarySchema>;
export type ShowtimeSeatsResponse = z.infer<typeof ShowtimeSeatsResponseSchema>;
