import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { FilmSummarySchema } from "@/lib/api/schemas";
import { validationError } from "@/lib/api/errors";
import { z } from "zod";

const QuerySchema = z
  .object({
    city: z.string().optional(),
  })
  .strict();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return validationError(parsed.error.issues);

  const { city } = parsed.data;
  const films = await prisma.film.findMany({
    where: city
      ? { showtimes: { some: { site: { city } } } }
      : undefined,
    orderBy: { title: "asc" },
  });

  const response = films.map((f) => ({
    id: f.id,
    title: f.title,
    posterUrl: f.posterUrl,
    durationMin: f.durationMin,
    rating: f.rating,
    genres: z.array(z.string()).parse(f.genres),
  }));

  return NextResponse.json(z.array(FilmSummarySchema).parse(response));
}
