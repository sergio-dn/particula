/**
 * Winner scoring system.
 *
 * Computes a composite "winner score" (0-100) for each product in a brand,
 * combining six normalised component scores:
 *
 *   winner_score =
 *     0.35 * sales_velocity_score +
 *     0.20 * restock_frequency_score +
 *     0.15 * stockout_signal_score +
 *     0.10 * longevity_score +
 *     0.10 * price_stability_score +
 *     0.10 * catalog_prominence_score
 */

import { prisma } from "@/lib/prisma"

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface WinnerResult {
  productId: string
  title: string
  winnerScore: number
  confidenceScore: number
  reasonCodes: string[]
  componentScores: ComponentScores
}

interface ComponentScores {
  sales_velocity_score: number
  restock_frequency_score: number
  stockout_signal_score: number
  longevity_score: number
  price_stability_score: number
  catalog_prominence_score: number
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const WEIGHTS = {
  sales_velocity_score: 0.35,
  restock_frequency_score: 0.20,
  stockout_signal_score: 0.15,
  longevity_score: 0.10,
  price_stability_score: 0.10,
  catalog_prominence_score: 0.10,
} as const

/** Clamp a value to [0, 100]. */
function clamp(value: number): number {
  return Math.max(0, Math.min(100, value))
}

// ──────────────────────────────────────────────
// Component score helpers
// ──────────────────────────────────────────────

/**
 * Sales velocity: aggregate unitsSold for the product's variants over the
 * last 7 and 30 days.  We score primarily on 7-day velocity with a 30-day
 * baseline so short spikes still register.
 *
 * Normalisation: 100 units/7d → score 100 (linear, capped).
 */
async function computeSalesVelocity(
  variantIds: string[],
  date: Date,
): Promise<{ score: number; recentSpike: boolean; hasData: boolean }> {
  if (variantIds.length === 0) return { score: 0, recentSpike: false, hasData: false }

  const sevenDaysAgo = new Date(date)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const thirtyDaysAgo = new Date(date)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const [recent, monthly] = await Promise.all([
    prisma.salesEstimate.aggregate({
      where: { variantId: { in: variantIds }, date: { gte: sevenDaysAgo, lte: date } },
      _sum: { unitsSold: true },
    }),
    prisma.salesEstimate.aggregate({
      where: { variantId: { in: variantIds }, date: { gte: thirtyDaysAgo, lte: date } },
      _sum: { unitsSold: true },
    }),
  ])

  const recentUnits = recent._sum.unitsSold ?? 0
  const monthlyUnits = monthly._sum.unitsSold ?? 0

  if (monthlyUnits === 0 && recentUnits === 0) {
    return { score: 0, recentSpike: false, hasData: false }
  }

  // Normalise: 100 units in 7 days → 100
  const score = clamp((recentUnits / 100) * 100)

  // Detect a recent spike: 7-day rate > 2× the 30-day daily rate
  const dailyRate30 = monthlyUnits / 30
  const dailyRate7 = recentUnits / 7
  const recentSpike = dailyRate30 > 0 && dailyRate7 > dailyRate30 * 2

  return { score, recentSpike, hasData: true }
}

/**
 * Restock frequency: count SalesEstimate rows where wasRestock = true in the
 * last 30 days across all variants.  More restocks imply higher demand.
 *
 * Normalisation: 10 restocks → score 100.
 */
async function computeRestockFrequency(
  variantIds: string[],
  date: Date,
): Promise<number> {
  if (variantIds.length === 0) return 0

  const thirtyDaysAgo = new Date(date)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const count = await prisma.salesEstimate.count({
    where: {
      variantId: { in: variantIds },
      date: { gte: thirtyDaysAgo, lte: date },
      wasRestock: true,
    },
  })

  return clamp((count / 10) * 100)
}

/**
 * Stockout signal: count OUT_OF_STOCK alert events for the brand in the
 * last 30 days.  Frequent stockouts suggest high demand.
 *
 * Normalisation: 5 stockout events → score 100.
 */
async function computeStockoutSignal(
  brandId: string,
  date: Date,
): Promise<{ score: number; alwaysAvailable: boolean }> {
  const thirtyDaysAgo = new Date(date)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const events = await prisma.alertEvent.count({
    where: {
      alert: {
        brandId,
        type: "OUT_OF_STOCK",
      },
      triggeredAt: { gte: thirtyDaysAgo, lte: date },
    },
  })

  return {
    score: clamp((events / 5) * 100),
    alwaysAvailable: events === 0,
  }
}

/**
 * Longevity: days since `firstSeenAt`.
 *
 * Normalisation: 365 days → score 100.
 */
function computeLongevity(firstSeenAt: Date, date: Date): number {
  const days = (date.getTime() - firstSeenAt.getTime()) / (1000 * 60 * 60 * 24)
  if (days < 0) return 0
  return clamp((days / 365) * 100)
}

/**
 * Price stability: coefficient of variation (CV) of prices over the last 30
 * days.  Low CV → high score.
 *
 * CV = stddev / mean.  Score = 100 − CV*500 (so CV of 0 → 100, CV of 0.2 → 0).
 */
async function computePriceStability(
  variantIds: string[],
  date: Date,
): Promise<{ score: number; hasData: boolean }> {
  if (variantIds.length === 0) return { score: 0, hasData: false }

  const thirtyDaysAgo = new Date(date)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const history = await prisma.priceHistory.findMany({
    where: {
      variantId: { in: variantIds },
      recordedAt: { gte: thirtyDaysAgo, lte: date },
    },
    select: { price: true },
  })

  if (history.length < 2) {
    return { score: history.length === 1 ? 80 : 0, hasData: history.length > 0 }
  }

  const prices = history.map((h) => Number(h.price))
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length
  if (mean === 0) return { score: 0, hasData: true }

  const variance = prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length
  const stddev = Math.sqrt(variance)
  const cv = stddev / mean

  return {
    score: clamp(100 - cv * 500),
    hasData: true,
  }
}

/**
 * Catalog prominence: product is still active and recently seen.
 *
 * 100 if active & lastSeenAt within 7 days, 50 if active but stale, 0 if inactive.
 */
function computeCatalogProminence(
  isActive: boolean,
  lastSeenAt: Date,
  date: Date,
): number {
  if (!isActive) return 0
  const daysSinceLastSeen =
    (date.getTime() - lastSeenAt.getTime()) / (1000 * 60 * 60 * 24)
  if (daysSinceLastSeen <= 7) return 100
  if (daysSinceLastSeen <= 30) return 50
  return 20
}

// ──────────────────────────────────────────────
// Confidence score
// ──────────────────────────────────────────────

function computeConfidence(
  hasInventoryData: boolean,
  productAgeDays: number,
  platformType: string | null,
): number {
  let confidence = hasInventoryData ? 0.8 : 0.5

  if (productAgeDays < 7) {
    confidence -= 0.1
  }
  if (!platformType || platformType.toUpperCase() === "GENERIC") {
    confidence -= 0.1
  }

  return Math.max(0.1, Math.round(confidence * 100) / 100)
}

// ──────────────────────────────────────────────
// Reason codes
// ──────────────────────────────────────────────

function deriveReasonCodes(
  components: ComponentScores,
  alwaysAvailable: boolean,
  recentSpike: boolean,
  hasData: boolean,
): string[] {
  if (!hasData) return ["INSUFFICIENT_DATA"]

  const codes: string[] = []

  if (components.sales_velocity_score > 70) codes.push("HIGH_INVENTORY_DEPLETION")
  if (components.restock_frequency_score > 60) codes.push("MULTIPLE_RESTOCKS")
  if (alwaysAvailable) codes.push("PERSISTENT_IN_STOCK")
  if (components.price_stability_score > 70) codes.push("LOW_PRICE_VOLATILITY")
  if (recentSpike) codes.push("RECENT_TOP_MOVEMENT")

  if (codes.length === 0) codes.push("INSUFFICIENT_DATA")

  return codes
}

// ──────────────────────────────────────────────
// Main exports
// ──────────────────────────────────────────────

/**
 * Compute and persist winner scores for every product belonging to a brand.
 * Returns the number of scores created/updated.
 */
export async function computeWinnerScores(
  brandId: string,
  date: Date,
): Promise<number> {
  const scoreDate = new Date(date)
  scoreDate.setHours(0, 0, 0, 0)

  // Fetch brand info for confidence adjustment
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { platformType: true },
  })

  // Fetch all products with their variants
  const products = await prisma.product.findMany({
    where: { brandId },
    select: {
      id: true,
      firstSeenAt: true,
      lastSeenAt: true,
      isActive: true,
      variants: { select: { id: true } },
    },
  })

  if (products.length === 0) return 0

  let count = 0

  for (const product of products) {
    const variantIds = product.variants.map((v) => v.id)

    // Compute all component scores in parallel where possible
    const [
      velocityResult,
      restockScore,
      stockoutResult,
      priceResult,
    ] = await Promise.all([
      computeSalesVelocity(variantIds, scoreDate),
      computeRestockFrequency(variantIds, scoreDate),
      computeStockoutSignal(brandId, scoreDate),
      computePriceStability(variantIds, scoreDate),
    ])

    const longevityScore = computeLongevity(product.firstSeenAt, scoreDate)
    const prominenceScore = computeCatalogProminence(
      product.isActive,
      product.lastSeenAt,
      scoreDate,
    )

    const components: ComponentScores = {
      sales_velocity_score: velocityResult.score,
      restock_frequency_score: restockScore,
      stockout_signal_score: stockoutResult.score,
      longevity_score: longevityScore,
      price_stability_score: priceResult.score,
      catalog_prominence_score: prominenceScore,
    }

    // Weighted sum
    const winnerScore = clamp(
      Object.entries(WEIGHTS).reduce(
        (sum, [key, weight]) => sum + weight * components[key as keyof ComponentScores],
        0,
      ),
    )

    // Determine whether we had real inventory data
    const hasInventoryData = velocityResult.hasData || priceResult.hasData
    const hasAnyData = hasInventoryData || restockScore > 0 || stockoutResult.score > 0

    const productAgeDays =
      (scoreDate.getTime() - product.firstSeenAt.getTime()) / (1000 * 60 * 60 * 24)

    const confidenceScore = computeConfidence(
      hasInventoryData,
      productAgeDays,
      brand?.platformType ?? null,
    )

    const reasonCodes = deriveReasonCodes(
      components,
      stockoutResult.alwaysAvailable,
      velocityResult.recentSpike,
      hasAnyData,
    )

    await prisma.winnerScore.upsert({
      where: {
        brandId_productId_scoreDate: {
          brandId,
          productId: product.id,
          scoreDate,
        },
      },
      create: {
        brandId,
        productId: product.id,
        scoreDate,
        winnerScore,
        confidenceScore,
        reasonCodes,
        componentScores: JSON.parse(JSON.stringify(components)),
      },
      update: {
        winnerScore,
        confidenceScore,
        reasonCodes,
        componentScores: JSON.parse(JSON.stringify(components)),
      },
    })

    count++
  }

  return count
}

/**
 * Retrieve the top-scoring winner products for a brand.
 */
export async function getTopWinners(
  brandId: string,
  options: { date?: Date; category?: string; limit?: number } = {},
): Promise<WinnerResult[]> {
  const { limit = 20, category, date } = options

  const scoreDate = date ? new Date(date) : new Date()
  scoreDate.setHours(0, 0, 0, 0)

  // Build product filter for category
  const productWhere: Record<string, unknown> = { brandId }
  if (category) {
    productWhere.productType = category
  }

  const scores = await prisma.winnerScore.findMany({
    where: {
      brandId,
      scoreDate,
      product: productWhere,
    },
    orderBy: { winnerScore: "desc" },
    take: limit,
    include: {
      product: {
        select: { id: true, title: true },
      },
    },
  })

  return scores.map((s) => ({
    productId: s.product.id,
    title: s.product.title,
    winnerScore: s.winnerScore,
    confidenceScore: s.confidenceScore,
    reasonCodes: s.reasonCodes as string[],
    componentScores: s.componentScores as unknown as ComponentScores,
  }))
}
