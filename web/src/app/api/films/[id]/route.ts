import { NextResponse } from "next/server";
import { getFilmDetail } from "@/lib/api/queries";
import { notFound } from "@/lib/api/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const film = await getFilmDetail(id);
  if (!film) return notFound();
  return NextResponse.json(film);
}
