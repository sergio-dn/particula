/**
 * Pipeline directo de scraping — sin dependencia de Redis/BullMQ.
 *
 * Flujo:
 *   1. Crear/actualizar ScrapeJob → RUNNING
 *   2. Fetch productos Shopify
 *   3. Upsert Products + Variants
 *   4. Crear InventorySnapshots
 *   5. Detectar cambios de precio → PriceHistory
 *   6. Marcar lanzamientos nuevos
 *   7. Calcular estimaciones de ventas (delta de inventario)
 *   8. Evaluar alertas
 *   9. Marcar ScrapeJob → COMPLETED
 */

import { prisma } from "@/lib/prisma"
import { fetchAllShopifyProducts, type ShopifyProduct } from "@/lib/scrapers/shopify"
import { computeDailySalesEstimates } from "@/lib/estimators/sales"
import { evaluateAlerts, type ScrapeResults } from "@/lib/pipeline/alerts"

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

    if (brand.shopifyStore) {
      const result = await processShopifyBrand(brand.id, brand.domain)
      productsFound = result.productsFound
      variantsFound = result.variantsFound
      newProductsCount = result.newProductIds.length
      newProductIds.push(...result.newProductIds)
      priceChanges.push(...result.priceChanges)
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
 * Procesa una marca Shopify: fetch productos, upsert en DB,
 * crear snapshots de inventario y detectar cambios de precio.
 */
async function processShopifyBrand(brandId: string, domain: string) {
  const newProductIds: string[] = []
  const priceChanges: PriceChangeInfo[] = []
  let productsFound = 0
  let variantsFound = 0

  const products = await fetchAllShopifyProducts(domain)

  // Obtener todos los externalIds ya conocidos de esta marca
  const existingProducts = await prisma.product.findMany({
    where: { brandId },
    select: { externalId: true, id: true },
  })
  const existingMap = new Map(existingProducts.map((p) => [p.externalId, p]))

  const now = new Date()

  for (const sp of products) {
    const externalId = String(sp.id)
    const existing = existingMap.get(externalId)
    const isNewProduct = !existing
    const isLaunch = isNewProduct

    // Upsert del producto
    const product = await prisma.product.upsert({
      where: { brandId_externalId: { brandId, externalId } },
      create: {
        brandId,
        externalId,
        title: sp.title,
        handle: sp.handle,
        productType: sp.product_type || null,
        tags: sp.tags ? sp.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        vendor: sp.vendor || null,
        imageUrl: sp.images?.[0]?.src ?? null,
        imageUrls: sp.images?.map((i) => i.src) ?? [],
        bodyHtml: sp.body_html || null,
        publishedAt: sp.published_at ? new Date(sp.published_at) : null,
        firstSeenAt: now,
        lastSeenAt: now,
        isActive: true,
        isLaunch,
        launchDate: isLaunch ? now : null,
      },
      update: {
        title: sp.title,
        handle: sp.handle,
        productType: sp.product_type || null,
        tags: sp.tags ? sp.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        vendor: sp.vendor || null,
        imageUrl: sp.images?.[0]?.src ?? null,
        imageUrls: sp.images?.map((i) => i.src) ?? [],
        lastSeenAt: now,
        isActive: true,
      },
    })

    if (isNewProduct) {
      newProductIds.push(product.id)
    }

    // Upsert de variantes + snapshot de inventario
    for (const sv of sp.variants) {
      const variantExtId = String(sv.id)

      const variant = await prisma.variant.upsert({
        where: { productId_externalId: { productId: product.id, externalId: variantExtId } },
        create: {
          productId: product.id,
          externalId: variantExtId,
          title: sv.title,
          sku: sv.sku || null,
          option1: sv.option1 || null,
          option2: sv.option2 || null,
          option3: sv.option3 || null,
          price: sv.price,
          compareAtPrice: sv.compare_at_price || null,
          isAvailable: sv.available,
          weight: sv.weight || null,
          weightUnit: sv.weight_unit || null,
        },
        update: {
          title: sv.title,
          sku: sv.sku || null,
          option1: sv.option1 || null,
          option2: sv.option2 || null,
          option3: sv.option3 || null,
          price: sv.price,
          compareAtPrice: sv.compare_at_price || null,
          isAvailable: sv.available,
        },
      })

      // Snapshot de inventario
      await prisma.inventorySnapshot.create({
        data: {
          variantId: variant.id,
          quantity: sv.inventory_quantity ?? 0,
          isAvailable: sv.available,
          snapshotAt: now,
        },
      })

      // Registrar cambio de precio si cambió
      const lastPrice = await prisma.priceHistory.findFirst({
        where: { variantId: variant.id },
        orderBy: { recordedAt: "desc" },
      })

      const priceChanged =
        !lastPrice ||
        lastPrice.price.toString() !== sv.price ||
        (lastPrice.compareAtPrice?.toString() ?? null) !== (sv.compare_at_price ?? null)

      if (priceChanged) {
        await prisma.priceHistory.create({
          data: {
            variantId: variant.id,
            price: sv.price,
            compareAtPrice: sv.compare_at_price || null,
            recordedAt: now,
          },
        })

        // Si no es un producto nuevo y el precio cambió, registrar como cambio
        if (lastPrice) {
          priceChanges.push({
            variantId: variant.id,
            sku: sv.sku,
            oldPrice: Number(lastPrice.price),
            newPrice: Number(sv.price),
            productTitle: sp.title,
          })
        }
      }

      variantsFound++
    }

    productsFound++
  }

  return { productsFound, variantsFound, newProductIds, priceChanges }
}
