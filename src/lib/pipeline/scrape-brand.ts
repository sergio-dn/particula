/**
 * Pipeline directo de scraping — sin dependencia de Redis/BullMQ.
 *
 * Flujo:
 *   1. Crear/actualizar ScrapeJob → RUNNING
 *   2. Seleccionar adapter por plataforma
 *   3. Fetch productos via adapter genérico
 *   4. Upsert Products + Variants
 *   5. Crear InventorySnapshots
 *   6. Detectar cambios de precio → PriceHistory
 *   7. Marcar lanzamientos nuevos
 *   8. Calcular estimaciones de ventas (delta de inventario)
 *   9. Evaluar alertas
 *  10. Marcar ScrapeJob → COMPLETED
 */

import { prisma } from "@/lib/prisma"
import { getAdapter } from "@/lib/scrapers/adapter"
import type { NormalizedProduct } from "@/lib/scrapers/adapter"
import type { PlatformType } from "@/lib/detectors/platform-detector"
import { computeDailySalesEstimates } from "@/lib/estimators/sales"
import { computeWinnerScores } from "@/lib/estimators/winners"
import { evaluateAlerts, type ScrapeResults, type DiscountChangeDetail } from "@/lib/pipeline/alerts"

export interface ScrapeResult {
  brandId: string
  productsFound: number
  variantsFound: number
  newProducts: number
  priceChanges: number
  status: "COMPLETED" | "FAILED"
  error?: string
}

interface PriceChangeInfo {
  variantId: string
  sku: string | null
  oldPrice: number
  newPrice: number
  productTitle: string
}

/**
 * Ejecuta el pipeline completo de scraping para una marca.
 * Función async pura — no depende de BullMQ ni Redis.
 */
export async function scrapeBrand(brandId: string): Promise<ScrapeResult> {
  const brand = await prisma.brand.findUnique({ where: { id: brandId } })
  if (!brand) throw new Error(`Brand ${brandId} not found`)

  // Marcar job(s) pendiente(s) como RUNNING
  await prisma.scrapeJob.updateMany({
    where: { brandId, status: "PENDING" },
    data: { status: "RUNNING", startedAt: new Date() },
  })

  try {
    let productsFound = 0
    let variantsFound = 0
    let newProductsCount = 0
    const newProductIds: string[] = []
    const priceChanges: PriceChangeInfo[] = []
    const restockedVariantIds: string[] = []
    const newVariantIds: string[] = []
    const discountStartDetails: DiscountChangeDetail[] = []
    const discountEndDetails: DiscountChangeDetail[] = []
    const outOfStockVariantIds: string[] = []
    const removedProductIds: string[] = []

    // Determinar plataforma: usar platformType guardado, o SHOPIFY si shopifyStore es true
    const platformType: PlatformType =
      (brand.platformType as PlatformType) ??
      (brand.shopifyStore ? "SHOPIFY" : "GENERIC")

    const adapter = await getAdapter(platformType)
    const products = await adapter.fetchAllProducts(brand.domain)

    const result = await processProducts(brand.id, products)
    productsFound = result.productsFound
    variantsFound = result.variantsFound
    newProductsCount = result.newProductIds.length
    newProductIds.push(...result.newProductIds)
    priceChanges.push(...result.priceChanges)
    restockedVariantIds.push(...result.restockedVariantIds)
    newVariantIds.push(...result.newVariantIds)
    discountStartDetails.push(...result.discountStartDetails)
    discountEndDetails.push(...result.discountEndDetails)
    outOfStockVariantIds.push(...result.outOfStockVariantIds)

    // Detect PRODUCT_REMOVED: products that were active but not in this scrape
    const scrapedExternalIds = new Set(products.map((p) => p.externalId))
    const activeProducts = await prisma.product.findMany({
      where: { brandId, isActive: true },
      select: { id: true, externalId: true },
    })
    for (const ap of activeProducts) {
      if (!scrapedExternalIds.has(ap.externalId)) {
        removedProductIds.push(ap.id)
        // Mark product as inactive
        await prisma.product.update({
          where: { id: ap.id },
          data: { isActive: false },
        })
      }
    }

    // Actualizar contadores en el scrape job
    await prisma.scrapeJob.updateMany({
      where: { brandId, status: "RUNNING" },
      data: { productsFound, variantsFound },
    })

    // Calcular estimaciones de ventas
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const estimatesCreated = await computeDailySalesEstimates(brandId, yesterday)

    // Calcular winner scores
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    await computeWinnerScores(brandId, today)

    // Evaluar alertas
    const scrapeResults: ScrapeResults = {
      brandId,
      newProductIds,
      priceChanges: priceChanges.map((pc) => ({
        variantId: pc.variantId,
        oldPrice: pc.oldPrice,
        newPrice: pc.newPrice,
      })),
      restockedVariantIds,
      totalUnitsSold: estimatesCreated, // aproximación — se refina con datos reales
      newVariantIds,
      discountStartDetails,
      discountEndDetails,
      outOfStockVariantIds,
      removedProductIds,
    }
    await evaluateAlerts(scrapeResults)

    // Marcar como completado
    await prisma.scrapeJob.updateMany({
      where: { brandId, status: "RUNNING" },
      data: { status: "COMPLETED", completedAt: new Date() },
    })

    console.log(
      `[pipeline] ${brand.domain}: ${productsFound} products, ${variantsFound} variants, ${newProductsCount} new, ${priceChanges.length} price changes`
    )

    return {
      brandId,
      productsFound,
      variantsFound,
      newProducts: newProductsCount,
      priceChanges: priceChanges.length,
      status: "COMPLETED",
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.scrapeJob.updateMany({
      where: { brandId, status: "RUNNING" },
      data: { status: "FAILED", completedAt: new Date(), error: message },
    })
    console.error(`[pipeline] ${brand.domain} failed:`, message)
    return {
      brandId,
      productsFound: 0,
      variantsFound: 0,
      newProducts: 0,
      priceChanges: 0,
      status: "FAILED",
      error: message,
    }
  }
}

/**
 * Procesa productos normalizados: upsert en DB,
 * crear snapshots de inventario y detectar cambios de precio.
 *
 * Funciona con cualquier adapter gracias a los tipos normalizados.
 */
async function processProducts(brandId: string, products: NormalizedProduct[]) {
  const newProductIds: string[] = []
  const priceChanges: PriceChangeInfo[] = []
  const restockedVariantIds: string[] = []
  const newVariantIds: string[] = []
  const discountStartDetails: DiscountChangeDetail[] = []
  const discountEndDetails: DiscountChangeDetail[] = []
  const outOfStockVariantIds: string[] = []
  let productsFound = 0
  let variantsFound = 0

  // Obtener todos los externalIds ya conocidos de esta marca
  const existingProducts = await prisma.product.findMany({
    where: { brandId },
    select: { externalId: true, id: true },
  })
  const existingMap = new Map(existingProducts.map((p: { externalId: string; id: string }) => [p.externalId, p]))

  // Pre-load existing variant externalIds per product to detect new variants
  const existingVariants = await prisma.variant.findMany({
    where: { product: { brandId } },
    select: { externalId: true, productId: true },
  })
  const existingVariantSet = new Set(
    existingVariants.map((v: { externalId: string; productId: string }) => `${v.productId}::${v.externalId}`)
  )

  const now = new Date()

  for (const np of products) {
    const existing = existingMap.get(np.externalId)
    const isNewProduct = !existing
    const isLaunch = isNewProduct

    // Upsert del producto
    const product = await prisma.product.upsert({
      where: { brandId_externalId: { brandId, externalId: np.externalId } },
      create: {
        brandId,
        externalId: np.externalId,
        title: np.title,
        handle: np.handle,
        productType: np.productType,
        tags: np.tags,
        vendor: np.vendor,
        imageUrl: np.imageUrl,
        imageUrls: np.imageUrls,
        bodyHtml: np.bodyHtml,
        publishedAt: np.publishedAt,
        firstSeenAt: now,
        lastSeenAt: now,
        isActive: true,
        isLaunch,
        launchDate: isLaunch ? now : null,
      },
      update: {
        title: np.title,
        handle: np.handle,
        productType: np.productType,
        tags: np.tags,
        vendor: np.vendor,
        imageUrl: np.imageUrl,
        imageUrls: np.imageUrls,
        lastSeenAt: now,
        isActive: true,
      },
    })

    if (isNewProduct) {
      newProductIds.push(product.id)
    }

    // Upsert de variantes + snapshot de inventario
    for (const nv of np.variants) {
      const variant = await prisma.variant.upsert({
        where: {
          productId_externalId: {
            productId: product.id,
            externalId: nv.externalId,
          },
        },
        create: {
          productId: product.id,
          externalId: nv.externalId,
          title: nv.title,
          sku: nv.sku,
          option1: nv.option1,
          option2: nv.option2,
          option3: nv.option3,
          price: nv.price.price,
          compareAtPrice: nv.price.compareAtPrice,
          isAvailable: nv.isAvailable,
          weight: nv.weight,
          weightUnit: nv.weightUnit,
        },
        update: {
          title: nv.title,
          sku: nv.sku,
          option1: nv.option1,
          option2: nv.option2,
          option3: nv.option3,
          price: nv.price.price,
          compareAtPrice: nv.price.compareAtPrice,
          isAvailable: nv.isAvailable,
        },
      })

      // Snapshot de inventario
      await prisma.inventorySnapshot.create({
        data: {
          variantId: variant.id,
          quantity: nv.inventoryQuantity ?? 0,
          isAvailable: nv.isAvailable,
          snapshotAt: now,
        },
      })

      // Detect VARIANT_ADDED: variant not previously known for this product
      const variantKey = `${product.id}::${nv.externalId}`
      if (!isNewProduct && !existingVariantSet.has(variantKey)) {
        newVariantIds.push(variant.id)
      }

      // Registrar cambio de precio si cambió
      const lastPrice = await prisma.priceHistory.findFirst({
        where: { variantId: variant.id },
        orderBy: { recordedAt: "desc" },
      })

      const priceChanged =
        !lastPrice ||
        lastPrice.price.toString() !== nv.price.price ||
        (lastPrice.compareAtPrice?.toString() ?? null) !==
          (nv.price.compareAtPrice ?? null)

      if (priceChanged) {
        await prisma.priceHistory.create({
          data: {
            variantId: variant.id,
            price: nv.price.price,
            compareAtPrice: nv.price.compareAtPrice,
            recordedAt: now,
          },
        })

        // Si no es un producto nuevo y el precio cambió, registrar como cambio
        if (lastPrice) {
          priceChanges.push({
            variantId: variant.id,
            sku: nv.sku,
            oldPrice: Number(lastPrice.price),
            newPrice: Number(nv.price.price),
            productTitle: np.title,
          })

          // Detect DISCOUNT_START: compareAtPrice appeared (was null, now has value)
          const hadCompareAt = lastPrice.compareAtPrice !== null
          const hasCompareAt = nv.price.compareAtPrice !== null
          if (!hadCompareAt && hasCompareAt) {
            discountStartDetails.push({
              variantId: variant.id,
              productTitle: np.title,
              price: Number(nv.price.price),
              compareAtPrice: Number(nv.price.compareAtPrice),
            })
          }

          // Detect DISCOUNT_END: compareAtPrice disappeared (had value, now null)
          if (hadCompareAt && !hasCompareAt) {
            discountEndDetails.push({
              variantId: variant.id,
              productTitle: np.title,
              price: Number(nv.price.price),
              compareAtPrice: null,
            })
          }
        }
      }

      // Detect OUT_OF_STOCK and RESTOCK by comparing with previous snapshot
      const prevSnapshot = await prisma.inventorySnapshot.findFirst({
        where: { variantId: variant.id, snapshotAt: { lt: now } },
        orderBy: { snapshotAt: "desc" },
      })
      if (prevSnapshot) {
        // OUT_OF_STOCK: was available, now unavailable
        if (prevSnapshot.isAvailable && !nv.isAvailable) {
          outOfStockVariantIds.push(variant.id)
        }
        // RESTOCK: was unavailable, now available
        if (!prevSnapshot.isAvailable && nv.isAvailable) {
          restockedVariantIds.push(variant.id)
        }
      }

      variantsFound++
    }

    productsFound++
  }

  return {
    productsFound,
    variantsFound,
    newProductIds,
    priceChanges,
    restockedVariantIds,
    newVariantIds,
    discountStartDetails,
    discountEndDetails,
    outOfStockVariantIds,
  }
}
