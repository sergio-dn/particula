-- Agregar columnas de notificación a BrandAlert
-- Estas columnas fueron añadidas al schema.prisma en Phase 6 pero nunca migradas

ALTER TABLE "BrandAlert" ADD COLUMN IF NOT EXISTS "emailEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "BrandAlert" ADD COLUMN IF NOT EXISTS "emailRecipients" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "BrandAlert" ADD COLUMN IF NOT EXISTS "webhookEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "BrandAlert" ADD COLUMN IF NOT EXISTS "webhookUrl" TEXT;
