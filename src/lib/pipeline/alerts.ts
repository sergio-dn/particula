/**
 * Sistema de evaluación de alertas.
 *
 * Después de cada scrape, evalúa las BrandAlerts activas
 * y crea AlertEvents cuando se cumplen las condiciones.
 */

import { prisma } from "@/lib/prisma"

export interface PriceChangeDetail {
  variantId: string
  oldPrice: number
  newPrice: number
}

export interface ScrapeResults {
  brandId: string
  newProductIds: string[]
  priceChanges: PriceChangeDetail[]
  restockedVariantIds: string[]
  totalUnitsSold: number
  newVariants: Array<{ variantId: string; productTitle: string; variantTitle: string }>
  discountStarts: Array<{ variantId: string; compareAtPrice: number; currentPrice: number; discountPercent: number }>
  discountEnds: Array<{ variantId: string; previousCompareAtPrice: number; currentPrice: number }>
  outOfStockVariantIds: string[]
  removedProductIds: string[]
}

/**
 * Evalúa todas las alertas activas para una marca
 * y crea AlertEvents cuando se cumplen las condiciones.
 * Returns the IDs of all created AlertEvent records.
 */
export async function evaluateAlerts(results: ScrapeResults): Promise<string[]> {
  const alerts = await prisma.brandAlert.findMany({
    where: { brandId: results.brandId, isActive: true },
  })

  const createdIds: string[] = []

  for (const alert of alerts) {
    switch (alert.type) {
      case "NEW_PRODUCTS": {
        if (results.newProductIds.length > 0) {
          const evt = await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              message: `${results.newProductIds.length} nuevo(s) producto(s) detectado(s)`,
              data: { productIds: results.newProductIds, count: results.newProductIds.length },
            },
          })
          createdIds.push(evt.id)
        }
        break
      }

      case "PRICE_DROP": {
        const drops = results.priceChanges.filter((c) => c.newPrice < c.oldPrice)
        if (drops.length > 0) {
          const evt = await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              message: `${drops.length} producto(s) con precio reducido`,
              data: {
                changes: drops.map((d) => ({
                  variantId: d.variantId,
                  oldPrice: d.oldPrice,
                  newPrice: d.newPrice,
                  discount: Math.round(((d.oldPrice - d.newPrice) / d.oldPrice) * 100),
                })),
              },
            },
          })
          createdIds.push(evt.id)
        }
        break
      }

      case "PRICE_CHANGE": {
        if (results.priceChanges.length > 0) {
          const evt = await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              message: `${results.priceChanges.length} cambio(s) de precio detectado(s)`,
              data: {
                changes: results.priceChanges.map((c) => ({
                  variantId: c.variantId,
                  oldPrice: c.oldPrice,
                  newPrice: c.newPrice,
                })),
              },
            },
          })
          createdIds.push(evt.id)
        }
        break
      }

      case "RESTOCK": {
        if (results.restockedVariantIds.length > 0) {
          const evt = await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              message: `${results.restockedVariantIds.length} variante(s) reabastecida(s)`,
              data: { variantIds: results.restockedVariantIds },
            },
          })
          createdIds.push(evt.id)
        }
        break
      }

      case "HIGH_VELOCITY": {
        const threshold = alert.threshold ?? 100
        if (results.totalUnitsSold > threshold) {
          const evt = await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              message: `Alta velocidad de venta: ${results.totalUnitsSold} unidades estimadas`,
              data: { unitsSold: results.totalUnitsSold, threshold },
            },
          })
          createdIds.push(evt.id)
        }
        break
      }

      case "VARIANT_ADDED": {
        if (results.newVariants.length > 0) {
          const evt = await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              message: `${results.newVariants.length} nueva(s) variante(s) detectada(s)`,
              data: {
                variants: results.newVariants,
                count: results.newVariants.length,
              },
            },
          })
          createdIds.push(evt.id)
        }
        break
      }

      case "DISCOUNT_START": {
        if (results.discountStarts.length > 0) {
          const evt = await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              message: `${results.discountStarts.length} producto(s) iniciaron descuento`,
              data: {
                discounts: results.discountStarts.map((d) => ({
                  variantId: d.variantId,
                  compareAtPrice: d.compareAtPrice,
                  currentPrice: d.currentPrice,
                  discountPercent: d.discountPercent,
                })),
              },
            },
          })
          createdIds.push(evt.id)
        }
        break
      }

      case "DISCOUNT_END": {
        if (results.discountEnds.length > 0) {
          const evt = await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              message: `${results.discountEnds.length} producto(s) terminaron descuento`,
              data: { discounts: results.discountEnds },
            },
          })
          createdIds.push(evt.id)
        }
        break
      }

      case "OUT_OF_STOCK": {
        if (results.outOfStockVariantIds.length > 0) {
          const evt = await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              message: `${results.outOfStockVariantIds.length} variante(s) agotada(s)`,
              data: { variantIds: results.outOfStockVariantIds },
            },
          })
          createdIds.push(evt.id)
        }
        break
      }

      case "PRODUCT_REMOVED": {
        if (results.removedProductIds.length > 0) {
          const evt = await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              message: `${results.removedProductIds.length} producto(s) removido(s) del catálogo`,
              data: { productIds: results.removedProductIds },
            },
          })
          createdIds.push(evt.id)
        }
        break
      }
    }
  }

  if (createdIds.length > 0) {
    console.log(`[alerts] ${createdIds.length} alert event(s) created for brand ${results.brandId}`)
  }

  return createdIds
}

/**
 * Crea alertas por defecto para una marca nueva.
 * Se llama al crear una marca.
 */
export async function createDefaultAlerts(brandId: string): Promise<void> {
  const alertTypes = [
    { type: "NEW_PRODUCTS" as const, threshold: null },
    { type: "PRICE_DROP" as const, threshold: null },
    { type: "PRICE_CHANGE" as const, threshold: null },
    { type: "RESTOCK" as const, threshold: null },
    { type: "HIGH_VELOCITY" as const, threshold: 100 },
    { type: "VARIANT_ADDED" as const, threshold: null },
    { type: "DISCOUNT_START" as const, threshold: null },
    { type: "DISCOUNT_END" as const, threshold: null },
    { type: "OUT_OF_STOCK" as const, threshold: null },
    { type: "PRODUCT_REMOVED" as const, threshold: null },
  ]

  await prisma.brandAlert.createMany({
    data: alertTypes.map((a) => ({
      brandId,
      type: a.type,
      threshold: a.threshold,
      isActive: true,
    })),
    skipDuplicates: true,
  })
}
