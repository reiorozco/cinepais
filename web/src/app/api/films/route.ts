import { NextResponse } from "next/server";
import { getFilms } from "@/lib/api/queries";
import { validationError } from "@/lib/api/errors";
import { z } from "zod";

const QuerySchema = z.object({ city: z.string().optional() }).strict();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return validationError(parsed.error.issues);
  return NextResponse.json(await getFilms(parsed.data.city));
}
