import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { ShowtimeSeatsResponseSchema, FormatSchema } from "@/lib/api/schemas";
import { notFound } from "@/lib/api/errors";
import { z } from "zod";

const formatMap: Record<string, string> = { TwoD: "2D" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const showtime = await prisma.showtime.findUnique({
    where: { id },
    include: { site: true, formats: true, seats: true },
  });
  if (!showtime) return notFound();

  const showtimeData = {
    id: showtime.id,
    filmId: showtime.filmId,
    siteId: showtime.siteId,
    siteName: showtime.site.name,
    city: showtime.site.city,
    businessDate: showtime.businessDate.toISOString().split("T")[0],
    time: showtime.time,
    room: showtime.room,
    formats: showtime.formats.map((f) => (formatMap[f.format] ?? f.format) as z.infer<typeof FormatSchema>),
  };

  const seats = showtime.seats.map((s) => ({
    seatId: s.seatId,
    row: s.row,
    col: s.col,
    area: s.area,
    status: s.status as "Available" | "Sold",
    areaCategory: s.areaCategory as "general" | "premium" | "wheelchair" | "preferential",
    qualityTier: s.qualityTier as "low" | "optimal" | "high",
  }));

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

  const summary = {
    totalCount: seats.length,
    availableCount: seats.filter((s) => s.status === "Available").length,
    byArea,
  };

  const response = { showtime: showtimeData, seats, summary };
  return NextResponse.json(ShowtimeSeatsResponseSchema.parse(response));
}
