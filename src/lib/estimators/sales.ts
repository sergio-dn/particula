/**
 * Sales estimation engine — methodology ladder implementation.
 *
 * Levels (in descending confidence):
 *   A  INVENTORY_DELTA     (base confidence 0.9)  — quantitative inventory available
 *   B  AVAILABILITY_PROXY  (base confidence 0.6)  — only in-stock / out-of-stock transitions
 *   C  WEAK_SIGNALS        (base confidence 0.3)  — catalog presence / price stability only
 *
 * Confidence is further adjusted downward when:
 *   - Snapshots are fewer than expected for the period
 *   - The brand uses a GENERIC adapter (platformType)
 *   - Inventory inconsistencies are detected (qty jumped up without a restock event)
 */

import { prisma } from "@/lib/prisma"

// ── Types ────────────────────────────────────────────────────────────────────

type Methodology = "INVENTORY_DELTA" | "AVAILABILITY_PROXY" | "WEAK_SIGNALS"

interface EstimateResult {
  unitsSold: number
  revenueEstimate: number
  wasRestock: boolean
  confidenceScore: number
  methodology: Methodology
  reasonCodes: string[]
}

// ── Constants ────────────────────────────────────────────────────────────────

const BASE_CONFIDENCE: Record<Methodology, number> = {
  INVENTORY_DELTA: 0.9,
  AVAILABILITY_PROXY: 0.6,
  WEAK_SIGNALS: 0.3,
}

/** How many snapshots per day we typically expect (used for gap penalty). */
const EXPECTED_SNAPSHOTS_PER_DAY = 2

/** Minimum units to attribute when only weak signals are present. */
const WEAK_SIGNAL_MIN_UNITS = 1

/** Average units assumed per stock-out cycle when using availability proxy. */
const AVG_UNITS_PER_STOCKOUT_CYCLE = 5

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)
}

function dayStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Determine the appropriate methodology level for a variant based on its
 * inventory snapshots.
 *
 * Level A — at least two snapshots have non-null, non-negative quantity
 * Level B — snapshots exist with availability info but quantity is always 0 or
 *           only one quantitative snapshot exists
 * Level C — no meaningful inventory data at all
 */
function pickMethodology(
  snapshots: { quantity: number; isAvailable: boolean }[],
): Methodology {
  const withQuantity = snapshots.filter((s) => s.quantity > 0)

  if (withQuantity.length >= 2) {
    return "INVENTORY_DELTA"
  }

  // If we have at least two snapshots with availability data we can look at
  // transitions (in-stock -> out-of-stock or vice-versa).
  if (snapshots.length >= 2) {
    const hasAvailabilityTransition = snapshots.some(
      (s, i) => i > 0 && s.isAvailable !== snapshots[i - 1].isAvailable,
    )
    if (hasAvailabilityTransition) {
      return "AVAILABILITY_PROXY"
    }
  }

  return "WEAK_SIGNALS"
}

// ── Level A — Inventory Delta ────────────────────────────────────────────────

function computeInventoryDelta(
  snapshots: { quantity: number; isAvailable: boolean; snapshotAt: Date }[],
  effectivePrice: number,
): EstimateResult {
  // snapshots are ordered desc (newest first)
  const reasonCodes: string[] = []
  let totalUnitsSold = 0
  let wasRestock = false
  let inconsistencies = 0

  // Walk pairwise from newest to oldest
  for (let i = 0; i < snapshots.length - 1; i++) {
    const curr = snapshots[i]
    const prev = snapshots[i + 1]
    const delta = prev.quantity - curr.quantity

    if (delta > 0) {
      totalUnitsSold += delta
      reasonCodes.push("INVENTORY_DEPLETION")
    } else if (delta < 0) {
      // Inventory increased — restock detected
      wasRestock = true
      inconsistencies++
      reasonCodes.push("RESTOCK_DETECTED")
    }
  }

  if (totalUnitsSold > 0) {
    reasonCodes.push("HIGH_INVENTORY_DEPLETION")
  }

  const revenueEstimate = totalUnitsSold * effectivePrice

  return {
    unitsSold: totalUnitsSold,
    revenueEstimate,
    wasRestock,
    confidenceScore: BASE_CONFIDENCE.INVENTORY_DELTA,
    methodology: "INVENTORY_DELTA",
    reasonCodes: [...new Set(reasonCodes)],
  }
}

// ── Level B — Availability Proxy ─────────────────────────────────────────────

function computeAvailabilityProxy(
  snapshots: { quantity: number; isAvailable: boolean; snapshotAt: Date }[],
  effectivePrice: number,
): EstimateResult {
  const reasonCodes: string[] = []

  // Count out-of-stock events (transitions from available → unavailable)
  let stockoutCycles = 0
  let restockEvents = 0

  for (let i = 0; i < snapshots.length - 1; i++) {
    const curr = snapshots[i]
    const prev = snapshots[i + 1]

    if (prev.isAvailable && !curr.isAvailable) {
      stockoutCycles++
      reasonCodes.push("STOCKOUT_EVENT")
    }
    if (!prev.isAvailable && curr.isAvailable) {
      restockEvents++
      reasonCodes.push("RESTOCK_EVENT")
    }
  }

  // Estimate units: each stockout cycle ~ AVG_UNITS_PER_STOCKOUT_CYCLE
  const estimatedUnits = stockoutCycles * AVG_UNITS_PER_STOCKOUT_CYCLE

  if (restockEvents > 1) {
    reasonCodes.push("MULTIPLE_RESTOCKS")
  }
  if (stockoutCycles > 0) {
    reasonCodes.push("AVAILABILITY_TRANSITIONS")
  }
  if (estimatedUnits === 0 && restockEvents > 0) {
    // Had restocks but no clear stockout → some movement
    reasonCodes.push("PERSISTENT_IN_STOCK")
  }

  const revenueEstimate = estimatedUnits * effectivePrice

  return {
    unitsSold: estimatedUnits,
    revenueEstimate,
    wasRestock: restockEvents > 0,
    confidenceScore: BASE_CONFIDENCE.AVAILABILITY_PROXY,
    methodology: "AVAILABILITY_PROXY",
    reasonCodes: [...new Set(reasonCodes)],
  }
}

// ── Level C — Weak Signals ───────────────────────────────────────────────────

function computeWeakSignals(
  snapshots: { quantity: number; isAvailable: boolean; snapshotAt: Date }[],
  effectivePrice: number,
  variant: { isAvailable: boolean },
): EstimateResult {
  const reasonCodes: string[] = []
  let units = 0

  // Catalog prominence: variant is still active / available
  if (variant.isAvailable) {
    reasonCodes.push("CATALOG_ACTIVE")
    units = WEAK_SIGNAL_MIN_UNITS
  }

  // Presence across time: if we have snapshots spanning several days, the
  // product has persistence
  if (snapshots.length >= 2) {
    const oldest = snapshots[snapshots.length - 1].snapshotAt
    const newest = snapshots[0].snapshotAt
    const span = daysBetween(newest, oldest)
    if (span >= 3) {
      reasonCodes.push("PRESENCE_ACROSS_TIME")
    }
  }

  // Price stability — not much we can check from snapshots alone, but if the
  // variant still has a price it signals stability
  if (effectivePrice > 0) {
    reasonCodes.push("LOW_PRICE_VOLATILITY")
  }

  if (reasonCodes.length === 0) {
    reasonCodes.push("INSUFFICIENT_DATA")
    units = 0
  }

  return {
    unitsSold: units,
    revenueEstimate: units * effectivePrice,
    wasRestock: false,
    confidenceScore: BASE_CONFIDENCE.WEAK_SIGNALS,
    methodology: "WEAK_SIGNALS",
    reasonCodes,
  }
}

// ── Confidence adjustments ───────────────────────────────────────────────────

function adjustConfidence(
  base: number,
  opts: {
    snapshotCount: number
    expectedSnapshots: number
    isGenericAdapter: boolean
    hasInventoryInconsistency: boolean
  },
): number {
  let score = base

  // Penalty for missing snapshots (proportional gap)
  if (opts.expectedSnapshots > 0 && opts.snapshotCount < opts.expectedSnapshots) {
    const ratio = opts.snapshotCount / opts.expectedSnapshots
    score *= clamp(ratio, 0.5, 1) // at most halve confidence
  }

  // Penalty for generic adapter
  if (opts.isGenericAdapter) {
    score *= 0.8
  }

  // Penalty for inventory inconsistency (qty jumped up without restock event)
  if (opts.hasInventoryInconsistency) {
    score *= 0.85
  }

  return clamp(parseFloat(score.toFixed(4)), 0.05, 1)
}

// ── Core: estimate a single variant for a date ──────────────────────────────

async function estimateVariant(
  variant: {
    id: string
    price: number
    isAvailable: boolean
    inventorySnapshots: {
      quantity: number
      isAvailable: boolean
      snapshotAt: Date
    }[]
  },
  isGenericAdapter: boolean,
  expectedSnapshots: number,
): Promise<EstimateResult | null> {
  const snapshots = variant.inventorySnapshots // ordered desc already

  if (snapshots.length === 0) return null

  const effectivePrice = variant.price
  const methodology = pickMethodology(snapshots)

  let result: EstimateResult

  switch (methodology) {
    case "INVENTORY_DELTA":
      result = computeInventoryDelta(snapshots, effectivePrice)
      break
    case "AVAILABILITY_PROXY":
      result = computeAvailabilityProxy(snapshots, effectivePrice)
      break
    case "WEAK_SIGNALS":
      result = computeWeakSignals(snapshots, effectivePrice, variant)
      break
  }

  // Detect inventory inconsistency: quantity jumped up in consecutive
  // snapshots without an explicit restock flag — only relevant for Level A.
  let hasInventoryInconsistency = false
  if (methodology === "INVENTORY_DELTA") {
    for (let i = 0; i < snapshots.length - 1; i++) {
      const curr = snapshots[i]
      const prev = snapshots[i + 1]
      if (curr.quantity > prev.quantity) {
        hasInventoryInconsistency = true
        break
      }
    }
  }

  result.confidenceScore = adjustConfidence(result.confidenceScore, {
    snapshotCount: snapshots.length,
    expectedSnapshots,
    isGenericAdapter,
    hasInventoryInconsistency,
  })

  // If no units and no meaningful signals, skip persisting a row
  if (result.unitsSold === 0 && !result.wasRestock && result.methodology === "WEAK_SIGNALS") {
    if (result.reasonCodes.includes("INSUFFICIENT_DATA")) return null
  }

  return result
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute and persist daily sales estimates for every variant of a brand,
 * using the full methodology ladder (A → B → C).
 *
 * Returns the number of estimate rows created / updated.
 */
export async function computeDailySalesEstimates(
  brandId: string,
  date: Date,
): Promise<number> {
  const targetDay = dayStart(date)

  // Fetch brand metadata for adapter check
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { platformType: true },
  })
  const isGenericAdapter = brand?.platformType === "GENERIC"

  // Fetch variants with their recent inventory snapshots
  const variants = await prisma.variant.findMany({
    where: { product: { brandId } },
    select: {
      id: true,
      price: true,
      isAvailable: true,
      product: { select: { brandId: true } },
      inventorySnapshots: {
        orderBy: { snapshotAt: "desc" },
        take: 10, // grab a reasonable window for multi-snapshot analysis
      },
    },
  })

  // Calculate how many snapshots we *expect* based on time range covered.
  // We look at the newest and oldest snapshot across all variants to infer the
  // observation window, then derive expected count from EXPECTED_SNAPSHOTS_PER_DAY.
  const allSnapshotDates = variants
    .flatMap((v) => v.inventorySnapshots.map((s) => s.snapshotAt.getTime()))

  let expectedSnapshots = EXPECTED_SNAPSHOTS_PER_DAY
  if (allSnapshotDates.length >= 2) {
    const newest = Math.max(...allSnapshotDates)
    const oldest = Math.min(...allSnapshotDates)
    const windowDays = Math.max(1, (newest - oldest) / (1000 * 60 * 60 * 24))
    expectedSnapshots = Math.ceil(windowDays * EXPECTED_SNAPSHOTS_PER_DAY)
  }

  let estimatesCreated = 0

  for (const variant of variants) {
    const result = await estimateVariant(
      {
        id: variant.id,
        price: Number(variant.price),
        isAvailable: variant.isAvailable,
        inventorySnapshots: variant.inventorySnapshots,
      },
      isGenericAdapter,
      expectedSnapshots,
    )

    if (!result) continue

    await prisma.salesEstimate.upsert({
      where: {
        variantId_date: { variantId: variant.id, date: targetDay },
      },
      create: {
        brandId,
        variantId: variant.id,
        date: targetDay,
        unitsSold: result.unitsSold,
        revenueEstimate: result.revenueEstimate,
        wasRestock: result.wasRestock,
        confidenceScore: result.confidenceScore,
        methodology: result.methodology,
        reasonCodes: result.reasonCodes,
      },
      update: {
        unitsSold: result.unitsSold,
        revenueEstimate: result.revenueEstimate,
        wasRestock: result.wasRestock,
        confidenceScore: result.confidenceScore,
        methodology: result.methodology,
        reasonCodes: result.reasonCodes,
      },
    })

    estimatesCreated++
  }

  return estimatesCreated
}

/**
 * Aggregate sales estimates for a brand over a date range.
 * Returns an array of { date, unitsSold, revenue, avgConfidence } for charting.
 */
export async function getBrandSalesCurve(
  brandId: string,
  from: Date,
  to: Date,
) {
  const estimates = await prisma.salesEstimate.groupBy({
    by: ["date"],
    where: {
      brandId,
      date: { gte: from, lte: to },
    },
    _sum: {
      unitsSold: true,
      revenueEstimate: true,
    },
    _avg: {
      confidenceScore: true,
    },
    _count: {
      id: true,
    },
    orderBy: { date: "asc" },
  })

  return estimates.map((e) => ({
    date: e.date,
    unitsSold: e._sum.unitsSold ?? 0,
    revenue: Number(e._sum.revenueEstimate ?? 0),
    avgConfidence: e._avg.confidenceScore ?? 0,
    variantCount: e._count.id,
  }))
}

/**
 * Retrieve per-variant sales estimates for the API.
 * Returns individual estimate rows with full methodology / confidence detail.
 */
export async function getVariantSalesEstimates(
  variantId: string,
  from: Date,
  to: Date,
) {
  const estimates = await prisma.salesEstimate.findMany({
    where: {
      variantId,
      date: { gte: from, lte: to },
    },
    orderBy: { date: "asc" },
    select: {
      id: true,
      date: true,
      unitsSold: true,
      revenueEstimate: true,
      wasRestock: true,
      confidenceScore: true,
      methodology: true,
      reasonCodes: true,
    },
  })

  return estimates.map((e) => ({
    id: e.id,
    date: e.date,
    unitsSold: e.unitsSold,
    revenue: Number(e.revenueEstimate),
    wasRestock: e.wasRestock,
    confidenceScore: e.confidenceScore,
    methodology: e.methodology,
    reasonCodes: e.reasonCodes as string[],
  }))
}
