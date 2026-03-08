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

export interface DiscountChangeDetail {
  variantId: string
  productTitle: string
  price: number
  compareAtPrice: number | null
}

export interface ScrapeResults {
  brandId: string
  newProductIds: string[]
  priceChanges: PriceChangeDetail[]
  restockedVariantIds: string[]
  totalUnitsSold: number
  newVariantIds: string[]
  discountStartDetails: DiscountChangeDetail[]
  discountEndDetails: DiscountChangeDetail[]
  outOfStockVariantIds: string[]
  removedProductIds: string[]
}

/**
 * Evalúa todas las alertas activas para una marca
 * y crea AlertEvents cuando se cumplen las condiciones.
 */
export async function evaluateAlerts(results: ScrapeResults): Promise<number> {
  const alerts = await prisma.brandAlert.findMany({
    where: { brandId: results.brandId, isActive: true },
  })

  let eventsCreated = 0

  for (const alert of alerts) {
    switch (alert.type) {
      case "NEW_PRODUCTS": {
        if (results.newProductIds.length > 0) {
          await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              message: `${results.newProductIds.length} nuevo(s) producto(s) detectado(s)`,
              data: { productIds: results.newProductIds, count: results.newProductIds.length },
            },
          })
          eventsCreated++
        }
        break
      }

      case "PRICE_DROP": {
        const drops = results.priceChanges.filter((c) => c.newPrice < c.oldPrice)
        if (drops.length > 0) {
          await prisma.alertEvent.create({
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
          eventsCreated++
        }
        break
      }

      case "PRICE_CHANGE": {
        if (results.priceChanges.length > 0) {
          await prisma.alertEvent.create({
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
          eventsCreated++
        }
        break
      }

      case "RESTOCK": {
        if (results.restockedVariantIds.length > 0) {
          await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              message: `${results.restockedVariantIds.length} variante(s) reabastecida(s)`,
              data: { variantIds: results.restockedVariantIds },
            },
          })
          eventsCreated++
        }
        break
      }

      case "HIGH_VELOCITY": {
        const threshold = alert.threshold ?? 100
        if (results.totalUnitsSold > threshold) {
          await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              message: `Alta velocidad de venta: ${results.totalUnitsSold} unidades estimadas`,
              data: { unitsSold: results.totalUnitsSold, threshold },
            },
          })
          eventsCreated++
        }
        break
      }

      case "VARIANT_ADDED": {
        if (results.newVariantIds.length > 0) {
          await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              message: `${results.newVariantIds.length} nueva(s) variante(s) agregada(s)`,
              data: { variantIds: results.newVariantIds, count: results.newVariantIds.length },
            },
          })
          eventsCreated++
        }
        break
      }

      case "DISCOUNT_START": {
        if (results.discountStartDetails.length > 0) {
          await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              message: `${results.discountStartDetails.length} variante(s) con descuento iniciado`,
              data: {
                variants: results.discountStartDetails.map((d) => ({
                  variantId: d.variantId,
                  productTitle: d.productTitle,
                  price: d.price,
                  compareAtPrice: d.compareAtPrice,
                })),
              },
            },
          })
          eventsCreated++
        }
        break
      }

      case "DISCOUNT_END": {
        if (results.discountEndDetails.length > 0) {
          await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              message: `${results.discountEndDetails.length} variante(s) con descuento finalizado`,
              data: {
                variants: results.discountEndDetails.map((d) => ({
                  variantId: d.variantId,
                  productTitle: d.productTitle,
                  price: d.price,
                })),
              },
            },
          })
          eventsCreated++
        }
        break
      }

      case "OUT_OF_STOCK": {
        if (results.outOfStockVariantIds.length > 0) {
          await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              message: `${results.outOfStockVariantIds.length} variante(s) sin stock`,
              data: { variantIds: results.outOfStockVariantIds, count: results.outOfStockVariantIds.length },
            },
          })
          eventsCreated++
        }
        break
      }

      case "PRODUCT_REMOVED": {
        if (results.removedProductIds.length > 0) {
          await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              message: `${results.removedProductIds.length} producto(s) eliminado(s) de la tienda`,
              data: { productIds: results.removedProductIds, count: results.removedProductIds.length },
            },
          })
          eventsCreated++
        }
        break
      }
    }
  }

  if (eventsCreated > 0) {
    console.log(`[alerts] ${eventsCreated} alert event(s) created for brand ${results.brandId}`)
  }

  return eventsCreated
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
