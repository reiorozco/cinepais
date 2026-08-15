-- CreateEnum
CREATE TYPE "Format" AS ENUM ('IMAX', 'Onyx', '2D', 'Doblada', 'Subtitulada', 'Premium');

-- CreateEnum
CREATE TYPE "SeatStatus" AS ENUM ('Available', 'Sold');

-- CreateEnum
CREATE TYPE "AreaCategory" AS ENUM ('general', 'premium', 'wheelchair', 'preferential');

-- CreateEnum
CREATE TYPE "QualityTier" AS ENUM ('low', 'optimal', 'high');

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteFormat" (
    "siteId" TEXT NOT NULL,
    "format" "Format" NOT NULL,

    CONSTRAINT "SiteFormat_pkey" PRIMARY KEY ("siteId","format")
);

-- CreateTable
CREATE TABLE "Film" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "posterUrl" TEXT NOT NULL,
    "synopsis" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "rating" TEXT NOT NULL,
    "director" TEXT NOT NULL,
    "cast" JSONB NOT NULL,
    "genres" JSONB NOT NULL,

    CONSTRAINT "Film_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Showtime" (
    "id" TEXT NOT NULL,
    "filmId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "time" TEXT NOT NULL,
    "room" TEXT NOT NULL,

    CONSTRAINT "Showtime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowtimeFormat" (
    "showtimeId" TEXT NOT NULL,
    "format" "Format" NOT NULL,

    CONSTRAINT "ShowtimeFormat_pkey" PRIMARY KEY ("showtimeId","format")
);

-- CreateTable
CREATE TABLE "Seat" (
    "showtimeId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "area" INTEGER NOT NULL,
    "status" "SeatStatus" NOT NULL,
    "areaCategory" "AreaCategory" NOT NULL,
    "qualityTier" "QualityTier" NOT NULL,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("showtimeId","seatId")
);

-- CreateIndex
CREATE INDEX "Site_city_idx" ON "Site"("city");

-- CreateIndex
CREATE INDEX "Showtime_filmId_businessDate_idx" ON "Showtime"("filmId", "businessDate");

-- CreateIndex
CREATE INDEX "Showtime_siteId_businessDate_idx" ON "Showtime"("siteId", "businessDate");

-- CreateIndex
CREATE INDEX "Seat_showtimeId_status_idx" ON "Seat"("showtimeId", "status");

-- AddForeignKey
ALTER TABLE "SiteFormat" ADD CONSTRAINT "SiteFormat_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_filmId_fkey" FOREIGN KEY ("filmId") REFERENCES "Film"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowtimeFormat" ADD CONSTRAINT "ShowtimeFormat_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "Showtime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "Showtime"("id") ON DELETE CASCADE ON UPDATE CASCADE;
