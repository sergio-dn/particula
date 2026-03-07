-- AlterTable
ALTER TABLE "Brand" ADD COLUMN "platformType" TEXT;
ALTER TABLE "Brand" ADD COLUMN "platformConfidence" DOUBLE PRECISION;
ALTER TABLE "Brand" ADD COLUMN "platformSignals" JSONB;
