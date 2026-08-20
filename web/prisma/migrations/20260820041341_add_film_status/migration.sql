-- CreateEnum
CREATE TYPE "FilmStatus" AS ENUM ('cartelera', 'pronto', 'preventa');

-- AlterTable
ALTER TABLE "Film" ADD COLUMN     "status" "FilmStatus" NOT NULL DEFAULT 'cartelera';
