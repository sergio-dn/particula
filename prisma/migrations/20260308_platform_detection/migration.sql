-- Issues #1, #2, #3: Platform detection fields
-- Ejecutar en Supabase PostgreSQL

ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "platformType" TEXT;
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "platformConfidence" DOUBLE PRECISION;
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "platformSignals" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill: marcas existentes con shopifyStore=true → platformType=SHOPIFY
UPDATE "Brand" SET "platformType" = 'SHOPIFY', "platformConfidence" = 0.9
WHERE "shopifyStore" = true AND "platformType" IS NULL;

UPDATE "Brand" SET "platformType" = 'GENERIC', "platformConfidence" = 0.0
WHERE "shopifyStore" = false AND "platformType" IS NULL;
