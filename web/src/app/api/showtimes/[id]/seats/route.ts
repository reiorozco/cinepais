import { NextResponse } from "next/server";
import { getSeats } from "@/lib/api/queries";
import { notFound } from "@/lib/api/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getSeats(id);
  if (!result) return notFound();
  return NextResponse.json(result);
}
