-- Issues #9, #12, #13, #14: New event types, winner scoring, confidence scores
-- Ejecutar en Supabase PostgreSQL

-- #9: Nuevos valores de AlertType enum
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'VARIANT_ADDED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'DISCOUNT_START';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'DISCOUNT_END';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'OUT_OF_STOCK';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'PRODUCT_REMOVED';

-- #14: Confidence score en SalesEstimate
ALTER TABLE "SalesEstimate" ADD COLUMN IF NOT EXISTS "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.3;

-- #12 + #13: WinnerScore model
CREATE TABLE IF NOT EXISTS "WinnerScore" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "salesVelocity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "restockFrequency" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stockoutSignal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "longevity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priceStability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "catalogProminence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "compositeScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reasonCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidenceTier" TEXT NOT NULL DEFAULT 'C',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WinnerScore_pkey" PRIMARY KEY ("id")
);

-- Indexes para WinnerScore
CREATE UNIQUE INDEX IF NOT EXISTS "WinnerScore_productId_date_key" ON "WinnerScore"("productId", "date");
CREATE INDEX IF NOT EXISTS "WinnerScore_brandId_date_idx" ON "WinnerScore"("brandId", "date");
CREATE INDEX IF NOT EXISTS "WinnerScore_compositeScore_idx" ON "WinnerScore"("compositeScore");
CREATE INDEX IF NOT EXISTS "WinnerScore_date_idx" ON "WinnerScore"("date");

-- Foreign key
ALTER TABLE "WinnerScore" ADD CONSTRAINT "WinnerScore_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
