import { describe, test, expect } from "vitest";
import {
  CitySchema,
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
