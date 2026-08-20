import { describe, test, expect } from "vitest";
import {
  CitySchema,
  FilmStatusSchema,
  FilmSummarySchema,
  FilmDetailSchema,
  ShowtimeSchema,
  SeatSchema,
  SeatSummarySchema,
  ShowtimeSeatsResponseSchema,
} from "../src/lib/api/schemas";

describe("Zod schemas parse README examples", () => {
  test("CitySchema parses city example", () => {
    const example = { id: "city-1", name: "Bogotá" };
    expect(() => CitySchema.parse(example)).not.toThrow();
  });

  test("FilmSummarySchema parses film list example", () => {
    const example = {
      id: "film-01",
      title: "La Odisea",
      posterUrl: "https://placehold.co/300x450?text=Film+01",
      durationMin: 165,
      rating: "PG-13",
      genres: ["Aventura", "Drama"],
      status: "cartelera",
    };
    expect(() => FilmSummarySchema.parse(example)).not.toThrow();
  });

  test("FilmDetailSchema parses film detail example", () => {
    const example = {
      id: "film-01",
      title: "La Odisea",
      posterUrl: "https://placehold.co/300x450?text=Film+01",
      durationMin: 165,
      rating: "PG-13",
      genres: ["Aventura", "Drama"],
      status: "cartelera",
      synopsis: "Un viaje épico por los siete mares en busca del hogar.",
      director: "Sofía Restrepo",
      cast: ["Carlos Vega", "María Ospina", "Andrés Cano"],
    };
    expect(() => FilmDetailSchema.parse(example)).not.toThrow();
  });

  test("ShowtimeSchema parses showtime example", () => {
    const example = {
      id: "st-site-bog-3-imax-4-2245",
      filmId: "film-01",
      siteId: "site-bog-3",
      siteName: "CinePaís Bogotá Norte",
      city: "Bogotá",
      businessDate: "2026-08-04",
      time: "22:45",
      room: "imax",
      formats: ["IMAX"],
      priceFrom: 32000,
    };
    expect(() => ShowtimeSchema.parse(example)).not.toThrow();
  });

  test("SeatSchema parses seat example", () => {
    const example = {
      seatId: "1_1_1",
      row: 1,
      col: 1,
      area: 1,
      status: "Available",
      areaCategory: "general",
      qualityTier: "low",
      price: 32000,
    };
    expect(() => SeatSchema.parse(example)).not.toThrow();
  });

  test("SeatSummarySchema parses summary example", () => {
    const example = {
      totalCount: 260,
      availableCount: 260,
      byArea: {
        general: { total: 156, available: 156 },
        premium: { total: 100, available: 100 },
        wheelchair: { total: 2, available: 2 },
        preferential: { total: 2, available: 2 },
      },
      priceTable: {
        general: 32000,
        preferential: 37000,
        premium: 43000,
        wheelchair: 32000,
      },
    };
    expect(() => SeatSummarySchema.parse(example)).not.toThrow();
  });

  test("ShowtimeSeatsResponseSchema parses full seats response example", () => {
    const example = {
      showtime: {
        id: "st-site-bog-3-imax-4-2245",
        filmId: "film-01",
        siteId: "site-bog-3",
        siteName: "CinePaís Bogotá Norte",
        city: "Bogotá",
        businessDate: "2026-08-04",
        time: "22:45",
        room: "imax",
        formats: ["IMAX"],
        priceFrom: 32000,
      },
      seats: [
        {
          seatId: "1_1_1",
          row: 1,
          col: 1,
          area: 1,
          status: "Available",
          areaCategory: "general",
          qualityTier: "low",
          price: 32000,
        },
      ],
      summary: {
        totalCount: 260,
        availableCount: 260,
        byArea: {
          general: { total: 156, available: 156 },
          premium: { total: 100, available: 100 },
          wheelchair: { total: 2, available: 2 },
          preferential: { total: 2, available: 2 },
        },
        priceTable: {
          general: 32000,
          preferential: 37000,
          premium: 43000,
          wheelchair: 32000,
        },
      },
    };
    expect(() => ShowtimeSeatsResponseSchema.parse(example)).not.toThrow();
  });
});

describe("FilmStatusSchema guards the film status enum", () => {
  const filmWithoutStatus = {
    id: "film-01",
    title: "La Odisea",
    posterUrl: "https://placehold.co/300x450?text=Film+01",
    durationMin: 165,
    rating: "PG-13",
    genres: ["Aventura", "Drama"],
  };

  test("accepts every value of the FilmStatus enum", () => {
    for (const status of FilmStatusSchema.options) {
      expect(FilmSummarySchema.safeParse({ ...filmWithoutStatus, status }).success).toBe(true);
    }
  });

  test("rejects an unknown status instead of letting it through", () => {
    const result = FilmSummarySchema.safeParse({ ...filmWithoutStatus, status: "estreno" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["status"]);
    }
  });

  test("rejects a missing status, so the projection cannot silently drop it", () => {
    expect(FilmSummarySchema.safeParse(filmWithoutStatus).success).toBe(false);
  });

  test("FilmDetailSchema inherits the same status validation", () => {
    const detailWithoutStatus = {
      ...filmWithoutStatus,
      synopsis: "Un viaje épico por los siete mares en busca del hogar.",
      director: "Sofía Restrepo",
      cast: ["Carlos Vega", "María Ospina", "Andrés Cano"],
    };
    expect(FilmDetailSchema.safeParse({ ...detailWithoutStatus, status: "preventa" }).success).toBe(
      true
    );
    expect(FilmDetailSchema.safeParse({ ...detailWithoutStatus, status: "Cartelera" }).success).toBe(
      false
    );
  });
});
