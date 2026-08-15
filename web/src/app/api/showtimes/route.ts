import { NextResponse } from "next/server";
import { getShowtimes } from "@/lib/api/queries";
import { validationError } from "@/lib/api/errors";
import { z } from "zod";

const QuerySchema = z
  .object({
    filmId: z.string().optional(),
    city: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    format: z.enum(["IMAX", "Onyx", "2D", "Doblada", "Subtitulada", "Premium"]).optional(),
  })
  .strict();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return validationError(parsed.error.issues);
  return NextResponse.json(await getShowtimes(parsed.data));
}
