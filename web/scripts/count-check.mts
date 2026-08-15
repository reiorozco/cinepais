import { config } from "dotenv";
config({ path: ".env.local" });
const { PrismaClient } = await import("../src/generated/prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const [sites, films, showtimes, seats] = await Promise.all([
  p.site.count(),
  p.film.count(),
  p.showtime.count(),
  p.seat.count(),
]);
console.log(JSON.stringify({ sites, films, showtimes, seats }));
await p.$disconnect();
