/**
 * Worker que procesa jobs de scraping.
 * Se ejecuta en un proceso separado via `npm run worker`.
 */

import { Worker, Job } from "bullmq"
import { prisma } from "@/lib/prisma"
import { fetchAllShopifyProducts } from "@/lib/scrapers/shopify"
import { getRedisConnection, QUEUES, ScrapeJobData } from "@/lib/jobs/queue"
import { computeDailySalesEstimates } from "@/lib/estimators/sales"

async function processScrapeJob(job: Job<ScrapeJobData>) {
  const { brandId, domain, type } = job.data

  // Marcar job como RUNNING en DB
  await prisma.scrapeJob.updateMany({
    where: { brandId, status: "PENDING" },
    data: { status: "RUNNING", startedAt: new Date() },
  })

  try {
    if (type === "SHOPIFY_FULL" || type === "SHOPIFY_INCREMENTAL") {
      await processShopify(brandId, domain, job)
    }

    // Después del scraping, calcular estimaciones de ventas para ayer
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    await computeDailySalesEstimates(brandId, yesterday)

    await prisma.scrapeJob.updateMany({
      where: { brandId, status: "RUNNING" },
      data: { status: "COMPLETED", completedAt: new Date() },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.scrapeJob.updateMany({
      where: { brandId, status: "RUNNING" },
      data: { status: "FAILED", completedAt: new Date(), error: message },
    })
    throw error
  }
}

async function processShopify(brandId: string, domain: string, job: Job<ScrapeJobData>) {
  let productsFound = 0
  let variantsFound = 0

  const products = await fetchAllShopifyProducts(domain, async (count) => {
    productsFound = count
    await job.updateProgress(Math.min(50, Math.floor((count / 500) * 50)))
  })

  // Obtener todos los externalIds ya conocidos de esta marca
  const existingProducts = await prisma.product.findMany({
    where: { brandId },
    select: { externalId: true, id: true, firstSeenAt: true },
  })
  const existingMap = new Map(existingProducts.map((p) => [p.externalId, p]))

  const now = new Date()

  for (const sp of products) {
    const externalId = String(sp.id)
    const existing = existingMap.get(externalId)

    // Detectar si es un lanzamiento nuevo (no lo habíamos visto antes)
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
      }

      variantsFound++
    }

    productsFound++
  }

  // Actualizar contadores en el scrape job
  await prisma.scrapeJob.updateMany({
    where: { brandId, status: "RUNNING" },
    data: { productsFound, variantsFound },
  })

  await job.updateProgress(100)
}

// Iniciar el worker
const worker = new Worker<ScrapeJobData>(
  QUEUES.SCRAPE,
  processScrapeJob,
  {
    connection: getRedisConnection(),
    concurrency: 3,
  }
)

worker.on("completed", (job) => {
  console.log(`[scrape-worker] Job ${job.id} completed`)
})

worker.on("failed", (job, err) => {
  console.error(`[scrape-worker] Job ${job?.id} failed:`, err.message)
})

console.log("[scrape-worker] Worker started")
