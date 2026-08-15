import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { CitySchema } from "@/lib/api/schemas";
import { z } from "zod";

export async function GET() {
  const sites = await prisma.site.findMany({
    select: { city: true },
    distinct: ["city"],
    orderBy: { city: "asc" },
  });
  const cities = sites.map((s, i) => ({ id: `city-${i + 1}`, name: s.city }));
  return NextResponse.json(z.array(CitySchema).parse(cities));
}
