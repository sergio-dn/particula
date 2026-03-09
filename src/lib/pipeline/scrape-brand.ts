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
import {
  detectInventoryTracking,
  batchProbeInventory,
  type VariantForProbe,
} from "@/lib/scrapers/shopify-inventory"
import { computeDailySalesEstimates } from "@/lib/estimators/sales"
import { computeBrandWinnerScores } from "@/lib/estimators/winner-score"
import { evaluateAlerts, type ScrapeResults } from "@/lib/pipeline/alerts"
import { dispatchNotifications } from "@/lib/notifications/dispatcher"
import { diffSnapshots, filterEvents, diffSummary } from "@/lib/pipeline/snapshot-diff"
import { pipelineLogger } from "@/lib/logger"
import { revalidateTag } from "next/cache"

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

  const log = pipelineLogger.child({ brandId, domain: brand.domain })
  const startTime = Date.now()

  try {
    let productsFound = 0
    let variantsFound = 0
    let newProductsCount = 0
    const newProductIds: string[] = []
    const priceChanges: PriceChangeInfo[] = []
    const restockedVariantIds: string[] = []

    if (brand.shopifyStore) {
      // Detectar inventory tracking en primer scrape (o si aún no se detectó)
      let inventoryTracking = brand.inventoryTracking
      if (inventoryTracking === null) {
        log.info("detecting inventory tracking")
        const detection = await detectInventoryTracking(brand.domain)
        inventoryTracking = detection.tracksInventory
        await prisma.brand.update({
          where: { id: brandId },
          data: { inventoryTracking },
        })
        log.info({ inventoryTracking }, "inventory tracking detected")
      }

      const result = await processShopifyBrand(brand.id, brand.domain, inventoryTracking)
      productsFound = result.productsFound
      variantsFound = result.variantsFound
      newProductsCount = result.newProductIds.length
      newProductIds.push(...result.newProductIds)
      priceChanges.push(...result.priceChanges)

      // Intentar obtener logo si no tiene uno
      if (!brand.logoUrl) {
        const logoUrl = await fetchBrandLogo(brand.domain, brandId)
        if (logoUrl) {
          await prisma.brand.update({ where: { id: brandId }, data: { logoUrl } })
          log.info({ logoUrl }, "brand logo set")
        }
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

    // Ejecutar diffing de snapshots para detectar eventos
    const diff = await diffSnapshots(brandId)
    log.info({ diff: diffSummary(diff) }, "snapshot diff complete")

    // Extraer datos del diff para alertas
    const outOfStockEvents = filterEvents(diff, "OUT_OF_STOCK")
    const restockEvents = filterEvents(diff, "RESTOCK")
    const variantAddedEvents = filterEvents(diff, "VARIANT_ADDED")
    const discountStartEvents = filterEvents(diff, "DISCOUNT_START")
    const discountEndEvents = filterEvents(diff, "DISCOUNT_END")
    const removedEvents = filterEvents(diff, "PRODUCT_REMOVED")

    // Popular restockedVariantIds del diff
    for (const evt of restockEvents) {
      if (evt.variantId) restockedVariantIds.push(evt.variantId)
    }

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
      totalUnitsSold: estimatesCreated,
      newVariants: variantAddedEvents.map((e) => ({
        variantId: e.variantId ?? "",
        productTitle: (e.data.productTitle as string) ?? "",
        variantTitle: (e.data.variantTitle as string) ?? "",
      })),
      discountStarts: discountStartEvents.map((e) => ({
        variantId: e.variantId ?? "",
        compareAtPrice: (e.data.compareAtPrice as number) ?? 0,
        currentPrice: (e.data.currentPrice as number) ?? 0,
        discountPercent: (e.data.discountPercent as number) ?? 0,
      })),
      discountEnds: discountEndEvents.map((e) => ({
        variantId: e.variantId ?? "",
        previousCompareAtPrice: (e.data.previousCompareAtPrice as number) ?? 0,
        currentPrice: (e.data.currentPrice as number) ?? 0,
      })),
      outOfStockVariantIds: outOfStockEvents
        .map((e) => e.variantId)
        .filter((id): id is string => id !== undefined),
      removedProductIds: removedEvents.map((e) => e.productId),
    }
    const alertEventIds = await evaluateAlerts(scrapeResults)

    // Dispatch email/webhook notifications
    await dispatchNotifications(brandId, alertEventIds).catch((e) =>
      log.error({ err: e }, "notification dispatch failed"),
    )

    // Calcular winner scores
    const scoresCreated = await computeBrandWinnerScores(brandId, yesterday)
    log.info({ scoresCreated }, "winner scores calculated")

    // Marcar como completado
    await prisma.scrapeJob.updateMany({
      where: { brandId, status: "RUNNING" },
      data: { status: "COMPLETED", completedAt: new Date() },
    })

    // Invalidar caches
    revalidateTag("dashboard-stats")
    revalidateTag("top-sellers")
    revalidateTag("sales")
    revalidateTag("winners")

    const durationMs = Date.now() - startTime
    log.info(
      { productsFound, variantsFound, newProducts: newProductsCount, priceChanges: priceChanges.length, durationMs },
      "scrape completed"
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
    const durationMs = Date.now() - startTime
    log.error({ err: message, durationMs }, "scrape failed")
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
 * crear snapshots de inventario, ejecutar cart probes si aplica,
 * y detectar cambios de precio.
 */
async function processShopifyBrand(
  brandId: string,
  domain: string,
  inventoryTracking: boolean,
) {
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

  // Mapa variantId (DB) → externalId (Shopify) para cart probe posterior
  const variantDbToExternal = new Map<string, { externalId: string; isAvailable: boolean; price: number }>()
  // Mapa de snapshots creados para actualizar con cart probe
  const snapshotIds = new Map<string, string>() // variantDbId → snapshotId

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
        tags: Array.isArray(sp.tags)
          ? sp.tags.map((t) => t.trim()).filter(Boolean)
          : typeof sp.tags === "string"
            ? sp.tags.split(",").map((t) => t.trim()).filter(Boolean)
            : [],
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
        tags: Array.isArray(sp.tags)
          ? sp.tags.map((t) => t.trim()).filter(Boolean)
          : typeof sp.tags === "string"
            ? sp.tags.split(",").map((t) => t.trim()).filter(Boolean)
            : [],
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

      // Snapshot de inventario — usar available como proxy (se actualiza con cart probe después)
      const snapshot = await prisma.inventorySnapshot.create({
        data: {
          variantId: variant.id,
          quantity: sv.available ? 1 : 0, // proxy binario — cart probe lo refina
          isAvailable: sv.available,
          probeMethod: "available_only",
          snapshotAt: now,
        },
      })

      // Guardar para cart probe posterior
      variantDbToExternal.set(variant.id, {
        externalId: variantExtId,
        isAvailable: sv.available,
        price: Number(sv.price),
      })
      snapshotIds.set(variant.id, snapshot.id)

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

  // ── Cart probe phase ──────────────────────────────────────────────────────
  // Si la tienda trackea inventario, hacer cart probes para obtener stock real
  if (inventoryTracking) {
    const probeVariants: VariantForProbe[] = Array.from(variantDbToExternal.entries()).map(
      ([, info]) => ({
        externalId: info.externalId,
        isAvailable: info.isAvailable,
        price: info.price,
      }),
    )

    pipelineLogger.info({ domain, availableVariants: probeVariants.filter((v) => v.isAvailable).length }, "running cart probes")
    const probeResult = await batchProbeInventory(domain, probeVariants)

    // Si la tienda bloqueó consistentemente, resetear inventoryTracking
    // para reintentar detección en el próximo ciclo (#30)
    if (probeResult.tracksInventory === null) {
      pipelineLogger.warn(
        { domain, brandId },
        "persistent blocks detected — resetting inventoryTracking for next cycle",
      )
      await prisma.brand.update({
        where: { id: brandId },
        data: { inventoryTracking: null },
      })
    }

    // Actualizar snapshots con datos reales del cart probe
    let probesApplied = 0
    for (const result of probeResult.results) {
      if (result.status !== "exact" || result.quantity === null) continue

      // Encontrar el variantDbId por externalId
      const entry = Array.from(variantDbToExternal.entries()).find(
        ([, info]) => info.externalId === String(result.variantId),
      )
      if (!entry) continue
      const [variantDbId] = entry
      const snapId = snapshotIds.get(variantDbId)
      if (!snapId) continue

      await prisma.inventorySnapshot.update({
        where: { id: snapId },
        data: {
          quantity: result.quantity,
          probeMethod: "cart_probe",
        },
      })
      probesApplied++
    }

    pipelineLogger.info(
      { domain, probed: probeResult.probed, snapshotsUpdated: probesApplied },
      "cart probe complete",
    )
  }

  return { productsFound, variantsFound, newProductIds, priceChanges }
}

/**
 * Intenta obtener un logo para la marca:
 * 1. Favicon del dominio (Google Favicon Service)
 * 2. Primer producto de la marca en la DB como fallback
 */
async function fetchBrandLogo(domain: string, brandId: string): Promise<string | null> {
  // Opción 1: usar Google Favicon service (siempre funciona, alta calidad)
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
  try {
    const res = await fetch(faviconUrl, { method: "HEAD" })
    if (res.ok) return faviconUrl
  } catch {
    // Silenciar — fallback a producto
  }

  // Opción 2: usar imagen del primer producto
  try {
    const product = await prisma.product.findFirst({
      where: { brandId, imageUrl: { not: null } },
      select: { imageUrl: true },
      orderBy: { firstSeenAt: "asc" },
    })
    if (product?.imageUrl) return product.imageUrl
  } catch {
    // Silenciar
  }

  return null
}
