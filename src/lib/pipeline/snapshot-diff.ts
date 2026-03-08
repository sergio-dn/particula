/**
 * Motor de diffing de snapshots — compara el estado actual vs anterior
 * de cada variante/producto y genera una lista tipificada de cambios.
 *
 * Usado por:
 *   - Sistema de alertas (evaluateAlerts)
 *   - Winner scoring (señales de velocidad, restocks, etc.)
 *   - Dashboard de eventos
 */

import { prisma } from "@/lib/prisma"

// ─── Types ───────────────────────────────────────────────────────────────────

export type DiffEventType =
  | "NEW_PRODUCT"
  | "PRODUCT_REMOVED"
  | "VARIANT_ADDED"
  | "PRICE_CHANGE"
  | "PRICE_DROP"
  | "PRICE_INCREASE"
  | "DISCOUNT_START"
  | "DISCOUNT_END"
  | "OUT_OF_STOCK"
  | "RESTOCK"
  | "INVENTORY_CHANGE"

export interface DiffEvent {
  type: DiffEventType
  productId: string
  variantId?: string
  brandId: string
  timestamp: Date
  data: Record<string, unknown>
}

export interface SnapshotDiffResult {
  brandId: string
  events: DiffEvent[]
  productsAnalyzed: number
  variantsAnalyzed: number
}

// ─── Core: Diff completo de una marca ────────────────────────────────────────

/**
 * Ejecuta un diff completo para una marca comparando snapshots actuales vs anteriores.
 *
 * Detecta:
 *   - Inventario: qty cambios, out_of_stock, restocks
 *   - Precios: cambios, drops, increases
 *   - Descuentos: compareAtPrice aparece/desaparece
 *   - Catálogo: productos nuevos, removidos, variantes nuevas
 */
export async function diffSnapshots(brandId: string): Promise<SnapshotDiffResult> {
  const events: DiffEvent[] = []
  const now = new Date()

  // ── 1. Detectar productos nuevos (lanzamientos) ──
  // Productos con firstSeenAt en las últimas 24 horas
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const newProducts = await prisma.product.findMany({
    where: {
      brandId,
      isActive: true,
      firstSeenAt: { gte: oneDayAgo },
    },
    select: { id: true, title: true, externalId: true },
  })

  for (const product of newProducts) {
    events.push({
      type: "NEW_PRODUCT",
      productId: product.id,
      brandId,
      timestamp: now,
      data: { title: product.title, externalId: product.externalId },
    })
  }

  // ── 2. Detectar productos removidos ──
  // Productos que estaban activos pero no se vieron en el último scrape (lastSeenAt < 24h)
  const removedProducts = await prisma.product.findMany({
    where: {
      brandId,
      isActive: true,
      lastSeenAt: { lt: oneDayAgo },
    },
    select: { id: true, title: true, externalId: true },
  })

  for (const product of removedProducts) {
    events.push({
      type: "PRODUCT_REMOVED",
      productId: product.id,
      brandId,
      timestamp: now,
      data: { title: product.title, externalId: product.externalId },
    })
  }

  // ── 3. Diff por variante: inventario, precios, disponibilidad ──
  const variants = await prisma.variant.findMany({
    where: { product: { brandId } },
    select: {
      id: true,
      productId: true,
      title: true,
      sku: true,
      price: true,
      compareAtPrice: true,
      isAvailable: true,
      product: { select: { title: true, firstSeenAt: true } },
      inventorySnapshots: {
        orderBy: { snapshotAt: "desc" },
        take: 2,
      },
      priceHistory: {
        orderBy: { recordedAt: "desc" },
        take: 2,
      },
    },
  })

  let variantsAnalyzed = 0

  for (const variant of variants) {
    variantsAnalyzed++
    const snapshots = variant.inventorySnapshots

    // ── 3a. Detectar variantes nuevas en productos existentes ──
    // Si la variante solo tiene 1 snapshot y el producto no es nuevo
    if (snapshots.length === 1 && variant.product.firstSeenAt < oneDayAgo) {
      events.push({
        type: "VARIANT_ADDED",
        productId: variant.productId,
        variantId: variant.id,
        brandId,
        timestamp: now,
        data: {
          variantTitle: variant.title,
          productTitle: variant.product.title,
          sku: variant.sku,
        },
      })
    }

    // Necesitamos al menos 2 snapshots para comparar
    if (snapshots.length < 2) continue

    const curr = snapshots[0] // más reciente
    const prev = snapshots[1] // anterior

    // ── 3b. Cambios de inventario ──
    if (curr.quantity !== prev.quantity) {
      events.push({
        type: "INVENTORY_CHANGE",
        productId: variant.productId,
        variantId: variant.id,
        brandId,
        timestamp: now,
        data: {
          quantityBefore: prev.quantity,
          quantityAfter: curr.quantity,
          delta: curr.quantity - prev.quantity,
          probeMethod: curr.probeMethod,
        },
      })
    }

    // ── 3c. Out of stock ──
    if (prev.isAvailable && !curr.isAvailable) {
      events.push({
        type: "OUT_OF_STOCK",
        productId: variant.productId,
        variantId: variant.id,
        brandId,
        timestamp: now,
        data: {
          variantTitle: variant.title,
          productTitle: variant.product.title,
          lastQuantity: prev.quantity,
        },
      })
    }

    // ── 3d. Restock ──
    if (!prev.isAvailable && curr.isAvailable) {
      events.push({
        type: "RESTOCK",
        productId: variant.productId,
        variantId: variant.id,
        brandId,
        timestamp: now,
        data: {
          variantTitle: variant.title,
          productTitle: variant.product.title,
          newQuantity: curr.quantity,
        },
      })
    }

    // ── 3e. Cambios de precio ──
    const priceHistory = variant.priceHistory
    if (priceHistory.length >= 2) {
      const currPrice = Number(priceHistory[0].price)
      const prevPrice = Number(priceHistory[1].price)

      if (currPrice !== prevPrice) {
        const changePercent = Math.round(((currPrice - prevPrice) / prevPrice) * 100)

        events.push({
          type: currPrice < prevPrice ? "PRICE_DROP" : "PRICE_INCREASE",
          productId: variant.productId,
          variantId: variant.id,
          brandId,
          timestamp: now,
          data: {
            priceBefore: prevPrice,
            priceAfter: currPrice,
            changePercent,
            variantTitle: variant.title,
            productTitle: variant.product.title,
          },
        })

        // También registrar como PRICE_CHANGE genérico
        events.push({
          type: "PRICE_CHANGE",
          productId: variant.productId,
          variantId: variant.id,
          brandId,
          timestamp: now,
          data: {
            priceBefore: prevPrice,
            priceAfter: currPrice,
            changePercent,
          },
        })
      }

      // ── 3f. Descuentos (compareAtPrice) ──
      const currCompare = priceHistory[0].compareAtPrice
        ? Number(priceHistory[0].compareAtPrice)
        : null
      const prevCompare = priceHistory[1].compareAtPrice
        ? Number(priceHistory[1].compareAtPrice)
        : null

      if (prevCompare === null && currCompare !== null) {
        // Descuento empieza
        events.push({
          type: "DISCOUNT_START",
          productId: variant.productId,
          variantId: variant.id,
          brandId,
          timestamp: now,
          data: {
            compareAtPrice: currCompare,
            currentPrice: currPrice,
            discountPercent: Math.round(((currCompare - currPrice) / currCompare) * 100),
            variantTitle: variant.title,
            productTitle: variant.product.title,
          },
        })
      } else if (prevCompare !== null && currCompare === null) {
        // Descuento termina
        events.push({
          type: "DISCOUNT_END",
          productId: variant.productId,
          variantId: variant.id,
          brandId,
          timestamp: now,
          data: {
            previousCompareAtPrice: prevCompare,
            currentPrice: currPrice,
            variantTitle: variant.title,
            productTitle: variant.product.title,
          },
        })
      }
    }
  }

  // Contar productos únicos analizados
  const uniqueProductIds = new Set(variants.map((v) => v.productId))

  return {
    brandId,
    events,
    productsAnalyzed: uniqueProductIds.size,
    variantsAnalyzed,
  }
}

/**
 * Filtra eventos de un diff por tipo.
 * Útil para alimentar subsistemas específicos (alertas, scoring, etc.)
 */
export function filterEvents(
  result: SnapshotDiffResult,
  ...types: DiffEventType[]
): DiffEvent[] {
  return result.events.filter((e) => types.includes(e.type))
}

/**
 * Resumen de un diff para logging.
 */
export function diffSummary(result: SnapshotDiffResult): string {
  const counts = new Map<DiffEventType, number>()
  for (const event of result.events) {
    counts.set(event.type, (counts.get(event.type) ?? 0) + 1)
  }

  const parts = Array.from(counts.entries())
    .map(([type, count]) => `${type}: ${count}`)
    .join(", ")

  return `[diff] ${result.brandId}: ${result.events.length} events (${parts}) — ${result.productsAnalyzed} products, ${result.variantsAnalyzed} variants`
}
