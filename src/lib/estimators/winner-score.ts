/**
 * Winner Scoring — score compuesto que identifica productos ganadores.
 *
 * Fórmula:
 *   winner_score =
 *     0.35 * sales_velocity +
 *     0.20 * restock_frequency +
 *     0.15 * stockout_signal +
 *     0.10 * longevity +
 *     0.10 * price_stability +
 *     0.10 * catalog_prominence
 *
 * Cada componente normalizado a 0-100.
 * Score se calcula por producto (agregando variantes).
 */

import { prisma } from "@/lib/prisma"

// ─── Constants ───────────────────────────────────────────────────────────────

const WEIGHTS = {
  salesVelocity: 0.35,
  restockFrequency: 0.20,
  stockoutSignal: 0.15,
  longevity: 0.10,
  priceStability: 0.10,
  catalogProminence: 0.10,
} as const

/** Ventana de análisis en días */
const ANALYSIS_WINDOW_DAYS = 30

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScoreComponents {
  salesVelocity: number
  restockFrequency: number
  stockoutSignal: number
  longevity: number
  priceStability: number
  catalogProminence: number
}

export interface ProductScore {
  productId: string
  brandId: string
  components: ScoreComponents
  compositeScore: number
  reasonCodes: string[]
  confidenceTier: "A" | "B" | "C"
}

// ─── Component Calculators ───────────────────────────────────────────────────

/**
 * Sales Velocity (0-100) — velocidad de venta normalizada.
 * Basado en total de unidades vendidas en la ventana de análisis.
 * Se normaliza contra el máximo de la marca para dar un score relativo.
 */
async function calcSalesVelocity(
  productId: string,
  brandId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<number> {
  // Obtener ventas de este producto
  const productSales = await prisma.salesEstimate.aggregate({
    where: {
      variant: { productId },
      date: { gte: windowStart, lte: windowEnd },
    },
    _sum: { unitsSold: true },
  })

  const totalUnits = productSales._sum.unitsSold ?? 0
  if (totalUnits === 0) return 0

  // Obtener el máximo de ventas de cualquier producto de la marca
  const allProducts = await prisma.product.findMany({
    where: { brandId },
    select: { id: true },
  })

  let maxUnits = 0
  for (const p of allProducts) {
    const sales = await prisma.salesEstimate.aggregate({
      where: {
        variant: { productId: p.id },
        date: { gte: windowStart, lte: windowEnd },
      },
      _sum: { unitsSold: true },
    })
    const units = sales._sum.unitsSold ?? 0
    if (units > maxUnits) maxUnits = units
  }

  if (maxUnits === 0) return 0
  return Math.min(100, Math.round((totalUnits / maxUnits) * 100))
}

/**
 * Restock Frequency (0-100) — frecuencia de reabastecimiento.
 * Más restocks = señal de demanda continua.
 * Detecta cuántas veces una variante pasó de !available → available.
 */
async function calcRestockFrequency(
  productId: string,
  windowStart: Date,
): Promise<number> {
  const variants = await prisma.variant.findMany({
    where: { productId },
    select: {
      inventorySnapshots: {
        orderBy: { snapshotAt: "asc" },
        where: { snapshotAt: { gte: windowStart } },
        select: { isAvailable: true },
      },
    },
  })

  let totalRestocks = 0
  for (const variant of variants) {
    const snaps = variant.inventorySnapshots
    for (let i = 1; i < snaps.length; i++) {
      if (!snaps[i - 1].isAvailable && snaps[i].isAvailable) {
        totalRestocks++
      }
    }
  }

  // Normalizar: 0 restocks = 0, 5+ restocks = 100
  return Math.min(100, Math.round((totalRestocks / 5) * 100))
}

/**
 * Stockout Signal (0-100) — frecuencia de agotamiento.
 * Agotarse frecuentemente = alta demanda (si también hay restocks).
 */
async function calcStockoutSignal(
  productId: string,
  windowStart: Date,
): Promise<number> {
  const variants = await prisma.variant.findMany({
    where: { productId },
    select: {
      inventorySnapshots: {
        orderBy: { snapshotAt: "asc" },
        where: { snapshotAt: { gte: windowStart } },
        select: { isAvailable: true },
      },
    },
  })

  let totalStockouts = 0
  for (const variant of variants) {
    const snaps = variant.inventorySnapshots
    for (let i = 1; i < snaps.length; i++) {
      if (snaps[i - 1].isAvailable && !snaps[i].isAvailable) {
        totalStockouts++
      }
    }
  }

  // Normalizar: 0 stockouts = 0, 5+ = 100
  return Math.min(100, Math.round((totalStockouts / 5) * 100))
}

/**
 * Longevity (0-100) — tiempo que el producto lleva activo.
 * Productos que permanecen en catálogo largo tiempo sin ser removidos
 * tienen demanda sostenida.
 */
async function calcLongevity(productId: string): Promise<number> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { firstSeenAt: true, lastSeenAt: true, isActive: true },
  })

  if (!product || !product.isActive) return 0

  const daysActive = Math.floor(
    (product.lastSeenAt.getTime() - product.firstSeenAt.getTime()) / (1000 * 60 * 60 * 24),
  )

  // Normalizar: 0 días = 0, 90+ días = 100
  return Math.min(100, Math.round((daysActive / 90) * 100))
}

/**
 * Price Stability (0-100) — estabilidad de precio.
 * Un producto que no necesita descuentos para vender tiene precio estable.
 * Más cambios de precio = menor estabilidad.
 */
async function calcPriceStability(
  productId: string,
  windowStart: Date,
): Promise<number> {
  const variants = await prisma.variant.findMany({
    where: { productId },
    select: {
      priceHistory: {
        where: { recordedAt: { gte: windowStart } },
        orderBy: { recordedAt: "asc" },
      },
    },
  })

  let totalChanges = 0
  for (const variant of variants) {
    // Cada entrada extra en priceHistory = un cambio de precio
    totalChanges += Math.max(0, variant.priceHistory.length - 1)
  }

  // Invertir: 0 cambios = 100 (estable), 10+ cambios = 0
  return Math.max(0, 100 - Math.round((totalChanges / 10) * 100))
}

/**
 * Catalog Prominence (0-100) — posición en catálogo.
 * Basado en número de variantes activas (más variantes = más inversión del brand).
 */
async function calcCatalogProminence(productId: string): Promise<number> {
  const variantCount = await prisma.variant.count({
    where: { productId, isAvailable: true },
  })

  // Normalizar: 1 variante = 10, 10+ variantes = 100
  return Math.min(100, Math.round((variantCount / 10) * 100))
}

// ─── Reason Codes ────────────────────────────────────────────────────────────

const REASON_THRESHOLDS: Array<{ component: keyof ScoreComponents; code: string; threshold: number }> = [
  { component: "salesVelocity", code: "HIGH_INVENTORY_DEPLETION", threshold: 60 },
  { component: "restockFrequency", code: "MULTIPLE_RESTOCKS", threshold: 50 },
  { component: "longevity", code: "PERSISTENT_IN_STOCK", threshold: 70 },
  { component: "priceStability", code: "LOW_PRICE_VOLATILITY", threshold: 80 },
  { component: "salesVelocity", code: "RECENT_TOP_MOVEMENT", threshold: 80 },
]

function deriveReasonCodes(components: ScoreComponents): string[] {
  return REASON_THRESHOLDS
    .filter(({ component, threshold }) => components[component] >= threshold)
    .map(({ code }) => code)
}

// ─── Confidence Tier ─────────────────────────────────────────────────────────

/**
 * Determina el tier de confianza basado en datos disponibles.
 *   A (0.9) — tiene datos de cart probe (inventario exacto)
 *   B (0.6) — tiene datos de availability (proxy)
 *   C (0.3) — solo datos de catálogo (sin inventario)
 */
async function deriveConfidenceTier(
  productId: string,
  windowStart: Date,
): Promise<"A" | "B" | "C"> {
  // Verificar si hay snapshots con cart_probe
  const cartProbeCount = await prisma.inventorySnapshot.count({
    where: {
      variant: { productId },
      probeMethod: "cart_probe",
      snapshotAt: { gte: windowStart },
    },
  })

  if (cartProbeCount > 0) return "A"

  // Verificar si hay snapshots con cambios de availability
  const snapshotCount = await prisma.inventorySnapshot.count({
    where: {
      variant: { productId },
      snapshotAt: { gte: windowStart },
    },
  })

  if (snapshotCount >= 2) return "B"

  return "C"
}

// ─── Main: Score de un producto ──────────────────────────────────────────────

/**
 * Calcula el winner score para un producto individual.
 */
export async function computeProductScore(
  productId: string,
  brandId: string,
  date: Date,
): Promise<ProductScore> {
  const windowStart = new Date(date)
  windowStart.setDate(windowStart.getDate() - ANALYSIS_WINDOW_DAYS)

  // Calcular cada componente en paralelo
  const [
    salesVelocity,
    restockFrequency,
    stockoutSignal,
    longevity,
    priceStability,
    catalogProminence,
    confidenceTier,
  ] = await Promise.all([
    calcSalesVelocity(productId, brandId, windowStart, date),
    calcRestockFrequency(productId, windowStart),
    calcStockoutSignal(productId, windowStart),
    calcLongevity(productId),
    calcPriceStability(productId, windowStart),
    calcCatalogProminence(productId),
    deriveConfidenceTier(productId, windowStart),
  ])

  const components: ScoreComponents = {
    salesVelocity,
    restockFrequency,
    stockoutSignal,
    longevity,
    priceStability,
    catalogProminence,
  }

  // Score compuesto ponderado
  const compositeScore = Math.round(
    WEIGHTS.salesVelocity * salesVelocity +
    WEIGHTS.restockFrequency * restockFrequency +
    WEIGHTS.stockoutSignal * stockoutSignal +
    WEIGHTS.longevity * longevity +
    WEIGHTS.priceStability * priceStability +
    WEIGHTS.catalogProminence * catalogProminence,
  )

  const reasonCodes = deriveReasonCodes(components)

  return {
    productId,
    brandId,
    components,
    compositeScore,
    reasonCodes,
    confidenceTier,
  }
}

// ─── Batch: Todos los productos de una marca ─────────────────────────────────

/**
 * Calcula y guarda winner scores para todos los productos activos de una marca.
 * Se ejecuta después de las estimaciones de ventas en el pipeline.
 */
export async function computeBrandWinnerScores(
  brandId: string,
  date: Date,
): Promise<number> {
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)

  const products = await prisma.product.findMany({
    where: { brandId, isActive: true },
    select: { id: true },
  })

  let scoresCreated = 0

  for (const product of products) {
    const score = await computeProductScore(product.id, brandId, date)

    await prisma.winnerScore.upsert({
      where: { productId_date: { productId: product.id, date: dayStart } },
      create: {
        productId: product.id,
        brandId,
        date: dayStart,
        salesVelocity: score.components.salesVelocity,
        restockFrequency: score.components.restockFrequency,
        stockoutSignal: score.components.stockoutSignal,
        longevity: score.components.longevity,
        priceStability: score.components.priceStability,
        catalogProminence: score.components.catalogProminence,
        compositeScore: score.compositeScore,
        reasonCodes: score.reasonCodes,
        confidenceTier: score.confidenceTier,
      },
      update: {
        salesVelocity: score.components.salesVelocity,
        restockFrequency: score.components.restockFrequency,
        stockoutSignal: score.components.stockoutSignal,
        longevity: score.components.longevity,
        priceStability: score.components.priceStability,
        catalogProminence: score.components.catalogProminence,
        compositeScore: score.compositeScore,
        reasonCodes: score.reasonCodes,
        confidenceTier: score.confidenceTier,
      },
    })

    scoresCreated++
  }

  return scoresCreated
}

/**
 * Obtiene el ranking de winners para una marca ordenados por score.
 */
export async function getBrandWinnerRanking(
  brandId: string,
  date: Date,
  limit: number = 20,
) {
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)

  return prisma.winnerScore.findMany({
    where: { brandId, date: dayStart },
    orderBy: { compositeScore: "desc" },
    take: limit,
    include: {
      product: {
        select: {
          title: true,
          handle: true,
          imageUrl: true,
          productType: true,
        },
      },
    },
  })
}
