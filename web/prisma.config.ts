import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env.local" });
config(); // fallback to .env if present

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED,
  },
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
