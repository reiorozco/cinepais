import { NextResponse } from "next/server";
import { getCities } from "@/lib/api/queries";

export async function GET() {
  return NextResponse.json(await getCities());
}
