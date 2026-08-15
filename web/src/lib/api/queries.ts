import { prisma } from "@/lib/db/client";
import { z } from "zod";
import type { Format } from "@/generated/prisma/enums";
import {
  FormatSchema,
  CitySchema,
  FilmSummarySchema,
  FilmDetailSchema,
  ShowtimeSchema,
  SeatSchema,
  SeatSummarySchema,
  ShowtimeSeatsResponseSchema,
} from "@/lib/api/schemas";
import { isPurchasable } from "@/lib/business/cutoff";
import { seatPrice } from "@/lib/business/pricing";

const formatMap: Record<string, string> = { TwoD: "2D" };

export async function getCities() {
  const sites = await prisma.site.findMany({
    select: { city: true },
    distinct: ["city"],
    orderBy: { city: "asc" },
  });
  const cities = sites.map((s, i) => ({ id: `city-${i + 1}`, name: s.city }));
  return z.array(CitySchema).parse(cities);
}

export async function getFilms(city?: string) {
  const films = await prisma.film.findMany({
    where: city ? { showtimes: { some: { site: { city } } } } : undefined,
    orderBy: { title: "asc" },
  });
  return z.array(FilmSummarySchema).parse(
    films.map((f) => ({
      id: f.id,
      title: f.title,
      posterUrl: f.posterUrl,
      durationMin: f.durationMin,
      rating: f.rating,
      genres: z.array(z.string()).parse(f.genres),
    }))
  );
}

export async function getFilmDetail(id: string) {
  const film = await prisma.film.findUnique({ where: { id } });
  if (!film) return null;
  return FilmDetailSchema.parse({
    id: film.id,
    title: film.title,
    posterUrl: film.posterUrl,
    durationMin: film.durationMin,
    rating: film.rating,
    genres: z.array(z.string()).parse(film.genres),
    synopsis: film.synopsis,
    director: film.director,
    cast: z.array(z.string()).parse(film.cast),
  });
}

export async function getShowtimes(filters: {
  filmId?: string;
  city?: string;
  date?: string;
  format?: string;
}) {
  const { filmId, city, date, format } = filters;
  const dbFormat = format === "2D" ? "TwoD" : format;
  const now = new Date();

  const showtimes = await prisma.showtime.findMany({
    where: {
      ...(filmId ? { filmId } : {}),
      ...(city ? { site: { city } } : {}),
      ...(date ? { businessDate: new Date(date) } : {}),
      ...(dbFormat ? { formats: { some: { format: dbFormat as Format } } } : {}),
    },
    include: { site: true, formats: true },
    orderBy: [{ businessDate: "asc" }, { time: "asc" }],
  });

  const purchasable = showtimes.filter((s) => {
    const [h, m] = s.time.split(":").map(Number);
    const start = new Date(s.businessDate);
    start.setHours(h, m, 0, 0);
    return isPurchasable(start, now);
  });

  return z.array(ShowtimeSchema).parse(
    purchasable.map((s) => {
      const formats = s.formats.map(
        (f) => (formatMap[f.format] ?? f.format) as z.infer<typeof FormatSchema>
      );
      const businessDate = s.businessDate.toISOString().split("T")[0];
      return {
        id: s.id,
        filmId: s.filmId,
        siteId: s.siteId,
        siteName: s.site.name,
        city: s.site.city,
        businessDate,
        time: s.time,
        room: s.room,
        formats,
        priceFrom: seatPrice(formats, "general", businessDate),
      };
    })
  );
}

export async function getSeats(showtimeId: string) {
  const showtime = await prisma.showtime.findUnique({
    where: { id: showtimeId },
    include: { site: true, formats: true, seats: true },
  });
  if (!showtime) return null;

  const formats = showtime.formats.map(
    (f) => (formatMap[f.format] ?? f.format) as z.infer<typeof FormatSchema>
  );
  const businessDate = showtime.businessDate.toISOString().split("T")[0];

  const showtimeData = ShowtimeSchema.parse({
    id: showtime.id,
    filmId: showtime.filmId,
    siteId: showtime.siteId,
    siteName: showtime.site.name,
    city: showtime.site.city,
    businessDate,
    time: showtime.time,
    room: showtime.room,
    formats,
    priceFrom: seatPrice(formats, "general", businessDate),
  });

  const seats = showtime.seats.map((s) => {
    return SeatSchema.parse({
      seatId: s.seatId,
      row: s.row,
      col: s.col,
      area: s.area,
      status: s.status as "Available" | "Sold",
      areaCategory: s.areaCategory as "general" | "premium" | "wheelchair" | "preferential",
      qualityTier: s.qualityTier as "low" | "optimal" | "high",
      price: seatPrice(
        formats,
        s.areaCategory as "general" | "premium" | "wheelchair" | "preferential",
        businessDate
      ),
    });
  });

  const categories = ["general", "premium", "wheelchair", "preferential"] as const;
  const byArea = Object.fromEntries(
    categories.map((cat) => {
      const catSeats = seats.filter((s) => s.areaCategory === cat);
      return [
        cat,
        {
          total: catSeats.length,
          available: catSeats.filter((s) => s.status === "Available").length,
        },
      ];
    })
  ) as Record<(typeof categories)[number], { total: number; available: number }>;

  const priceTable = Object.fromEntries(
    categories.map((cat) => [cat, seatPrice(formats, cat, businessDate)])
  ) as { general: number; preferential: number; premium: number; wheelchair: number };

  const summary = SeatSummarySchema.parse({
    totalCount: seats.length,
    availableCount: seats.filter((s) => s.status === "Available").length,
    byArea,
    priceTable,
  });

  return ShowtimeSeatsResponseSchema.parse({ showtime: showtimeData, seats, summary });
}
