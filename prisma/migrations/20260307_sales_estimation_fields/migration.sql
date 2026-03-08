-- Issue #27: Schema changes para estimación de ventas híbrida
-- Agrega campos necesarios para cart probe + available delta estimation

-- Brand: detectar si la tienda trackea inventario
ALTER TABLE "Brand" ADD COLUMN "inventoryTracking" BOOLEAN;

-- InventorySnapshot: método de probe usado para este snapshot
ALTER TABLE "InventorySnapshot" ADD COLUMN "probeMethod" TEXT;

-- SalesEstimate: método de estimación usado
ALTER TABLE "SalesEstimate" ADD COLUMN "estimationMethod" TEXT NOT NULL DEFAULT 'cart_probe';
