/**
 * Estimador de ventas híbrido — tres tiers de confianza según datos disponibles.
 *
 * Tier A (0.9) — Cart probe (precisión alta):
 *   Ambos snapshots tienen probeMethod: "cart_probe"
 *   unitsSold = prev.quantity - curr.quantity
 *
 * Tier B (0.6) — Available delta (precisión media):
 *   Snapshots con probeMethod: "available_only" o null (legacy)
 *   available: true → false = 1 unidad vendida (mínimo estimable)
 *
 * Tier C (0.3) — Catalog signal (precisión baja):
 *   Sin cambios detectables en inventario ni availability
 *   Estima 1 unidad/día si el producto sigue activo y available (señal mínima)
 *   Retorna INSUFFICIENT_DATA si no hay señales
 */

import { prisma } from "@/lib/prisma"

// ─── Confidence Tiers ────────────────────────────────────────────────────────

export const CONFIDENCE_TIERS = {
  A: { score: 0.9, method: "cart_probe", label: "Inventario exacto" },
  B: { score: 0.6, method: "available_delta", label: "Proxy de disponibilidad" },
  C: { score: 0.3, method: "catalog_signal", label: "Señal de catálogo" },
} as const

export type ConfidenceTier = keyof typeof CONFIDENCE_TIERS

/**
 * Calcula y guarda las estimaciones de ventas para una marca,
 * comparando los dos snapshots más recientes de cada variante.
 *
 * Usa un sistema de 3 tiers:
 *   - Tier A: Cart probe → delta de inventario exacto (conf: 0.9)
 *   - Tier B: Available delta → cambio binario (conf: 0.6)
 *   - Tier C: Catalog signal → producto activo sin cambios (conf: 0.3)
 */
export async function computeDailySalesEstimates(brandId: string, date: Date): Promise<number> {
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)

  // Obtener los 2 snapshots más recientes por variante
  const variants = await prisma.variant.findMany({
    where: { product: { brandId } },
    select: {
      id: true,
      price: true,
      isAvailable: true,
      product: { select: { brandId: true, isActive: true } },
      inventorySnapshots: {
        orderBy: { snapshotAt: "desc" },
        take: 2,
      },
    },
  })

  let estimatesCreated = 0

  for (const variant of variants) {
    const snapshots = variant.inventorySnapshots

    let unitsSold = 0
    let wasRestock = false
    let estimationMethod: string
    let confidenceScore: number

    // ── Caso especial: solo 1 snapshot (primer scrape) ──
    if (snapshots.length < 2) {
      // Tier C: si está disponible y activo, señal mínima
      if (variant.isAvailable && variant.product.isActive) {
        unitsSold = 0 // no podemos estimar sin comparación
        estimationMethod = "catalog_signal"
        confidenceScore = CONFIDENCE_TIERS.C.score
        // No crear estimación sin ventas detectadas en Tier C
        continue
      }
      continue
    }

    const curr = snapshots[0] // más reciente
    const prev = snapshots[1] // anterior

    const bothCartProbe =
      curr.probeMethod === "cart_probe" && prev.probeMethod === "cart_probe"

    if (bothCartProbe) {
      // ── Tier A: Cart probe — delta de inventario exacto ──
      const delta = prev.quantity - curr.quantity
      wasRestock = delta < 0

      if (delta <= 0) continue // restock o sin cambio → skip

      unitsSold = delta
      estimationMethod = "cart_probe"
      confidenceScore = CONFIDENCE_TIERS.A.score
    } else {
      // ── Tier B: Available delta — estimación binaria ──
      const wasAvailable = prev.isAvailable
      const isAvailable = curr.isAvailable

      if (wasAvailable && !isAvailable) {
        // Se agotó → estimar 1 unidad vendida (mínimo)
        unitsSold = 1
        estimationMethod = "available_delta"
        confidenceScore = CONFIDENCE_TIERS.B.score
      } else if (!wasAvailable && isAvailable) {
        // Restock — no es una venta
        wasRestock = true
        continue
      } else if (wasAvailable && isAvailable) {
        // ── Tier C: Ambos available, sin cambio detectable ──
        // Si hay cambio de quantity en cart probe parcial, usar eso
        if (curr.probeMethod === "cart_probe" && prev.quantity > 0 && curr.quantity < prev.quantity) {
          unitsSold = prev.quantity - curr.quantity
          estimationMethod = "cart_probe"
          confidenceScore = CONFIDENCE_TIERS.A.score
        } else {
          // Sin señal suficiente — INSUFFICIENT_DATA
          continue
        }
      } else {
        // Ambos false — sin cambio
        continue
      }
    }

    const revenueEstimate = unitsSold * Number(variant.price)

    await prisma.salesEstimate.upsert({
      where: { variantId_date: { variantId: variant.id, date: dayStart } },
      create: {
        brandId,
        variantId: variant.id,
        date: dayStart,
        unitsSold,
        revenueEstimate,
        wasRestock,
        estimationMethod,
        confidenceScore,
      },
      update: {
        unitsSold,
        revenueEstimate,
        wasRestock,
        estimationMethod,
        confidenceScore,
      },
    })

    estimatesCreated++
  }

  return estimatesCreated
}

/**
 * Agrega estimaciones de ventas por marca en un rango de fechas.
 * Retorna un array de { date, unitsSold, revenue, avgConfidence } para graficar curva de ventas.
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
    orderBy: { date: "asc" },
  })

  return estimates.map((e) => ({
    date: e.date,
    unitsSold: e._sum.unitsSold ?? 0,
    revenue: Number(e._sum.revenueEstimate ?? 0),
    avgConfidence: e._avg.confidenceScore ?? 0,
  }))
}

/**
 * Obtiene el tier de confianza de una estimación.
 */
export function getConfidenceTier(confidenceScore: number): ConfidenceTier {
  if (confidenceScore >= 0.8) return "A"
  if (confidenceScore >= 0.5) return "B"
  return "C"
}

/**
 * Retorna una etiqueta legible para un score de confianza.
 */
export function getConfidenceLabel(confidenceScore: number): string {
  const tier = getConfidenceTier(confidenceScore)
  return CONFIDENCE_TIERS[tier].label
}
