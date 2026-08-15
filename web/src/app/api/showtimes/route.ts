import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { ShowtimeSchema, FormatSchema } from "@/lib/api/schemas";
import { validationError } from "@/lib/api/errors";
import { isPurchasable } from "@/lib/business/cutoff";
import type { Format } from "@/generated/prisma/enums";
import { z } from "zod";

const QuerySchema = z
  .object({
    filmId: z.string().optional(),
    city: z.string().optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    format: z
      .enum(["IMAX", "Onyx", "2D", "Doblada", "Subtitulada", "Premium"])
      .optional(),
  })
  .strict();

const formatMap: Record<string, string> = { TwoD: "2D" };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return validationError(parsed.error.issues);

  const { filmId, city, date, format } = parsed.data;
  const now = new Date();

  // When filtering by format we need to reverse-map "2D" → "TwoD" for the DB enum
  const dbFormat = format === "2D" ? "TwoD" : format;

  const showtimes = await prisma.showtime.findMany({
    where: {
      ...(filmId ? { filmId } : {}),
      ...(city ? { site: { city } } : {}),
      ...(date ? { businessDate: new Date(date) } : {}),
      ...(dbFormat ? { formats: { some: { format: dbFormat as Format } } } : {}),
    },
    include: {
      site: true,
      formats: true,
    },
    orderBy: [{ businessDate: "asc" }, { time: "asc" }],
  });

  const purchasable = showtimes.filter((s) => {
    const [h, m] = s.time.split(":").map(Number);
    const start = new Date(s.businessDate);
    start.setHours(h, m, 0, 0);
    return isPurchasable(start, now);
  });

  const response = purchasable.map((s) => ({
    id: s.id,
    filmId: s.filmId,
    siteId: s.siteId,
    siteName: s.site.name,
    city: s.site.city,
    businessDate: s.businessDate.toISOString().split("T")[0],
    time: s.time,
    room: s.room,
    formats: s.formats.map((f) => (formatMap[f.format] ?? f.format) as z.infer<typeof FormatSchema>),
  }));

  return NextResponse.json(z.array(ShowtimeSchema).parse(response));
}
