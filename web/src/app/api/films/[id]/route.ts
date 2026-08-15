import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { FilmDetailSchema } from "@/lib/api/schemas";
import { notFound } from "@/lib/api/errors";
import { z } from "zod";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const film = await prisma.film.findUnique({ where: { id } });
  if (!film) return notFound();

  const response = {
    id: film.id,
    title: film.title,
    posterUrl: film.posterUrl,
    durationMin: film.durationMin,
    rating: film.rating,
    genres: z.array(z.string()).parse(film.genres),
    synopsis: film.synopsis,
    director: film.director,
    cast: z.array(z.string()).parse(film.cast),
  };

  return NextResponse.json(FilmDetailSchema.parse(response));
}
