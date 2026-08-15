import { config } from "dotenv";
config({ path: ".env.local" });
const { PrismaClient } = await import("../src/generated/prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
console.log(JSON.stringify(await p.$queryRaw`SELECT 1 AS ok`));
await p.$disconnect();
