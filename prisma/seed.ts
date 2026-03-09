import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"
import "dotenv/config"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL as string })
const prisma = new PrismaClient({ adapter })

// Fechas de referencia
const now = new Date()
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

// Fecha sin hora para campos @db.Date
function dateOnly(d: Date): Date {
  const result = new Date(d)
  result.setHours(0, 0, 0, 0)
  return result
}

// Tipos de alerta por defecto (misma lista que alerts.ts)
const DEFAULT_ALERT_TYPES: { type: "NEW_PRODUCTS" | "PRICE_DROP" | "PRICE_CHANGE" | "RESTOCK" | "HIGH_VELOCITY" | "VARIANT_ADDED" | "DISCOUNT_START" | "DISCOUNT_END" | "OUT_OF_STOCK" | "PRODUCT_REMOVED"; threshold: number | null }[] = [
  { type: "NEW_PRODUCTS", threshold: null },
  { type: "PRICE_DROP", threshold: null },
  { type: "PRICE_CHANGE", threshold: null },
  { type: "RESTOCK", threshold: null },
  { type: "HIGH_VELOCITY", threshold: 100 },
  { type: "VARIANT_ADDED", threshold: null },
  { type: "DISCOUNT_START", threshold: null },
  { type: "DISCOUNT_END", threshold: null },
  { type: "OUT_OF_STOCK", threshold: null },
  { type: "PRODUCT_REMOVED", threshold: null },
]

async function main() {
  console.log("Seeding database...")

  // ── 1. Usuario admin ──
  const hashedPassword = await bcrypt.hash("admin123", 10)

  const user = await prisma.user.upsert({
    where: { email: "admin@particula.cl" },
    update: { name: "Admin Particula", role: "ADMIN", password: hashedPassword },
    create: {
      email: "admin@particula.cl",
      name: "Admin Particula",
      password: hashedPassword,
      role: "ADMIN",
    },
  })
  console.log(`  ✓ Usuario: ${user.email}`)

  // ── 2. Marcas demo ──
  const allbirds = await prisma.brand.upsert({
    where: { domain: "allbirds.com" },
    update: {},
    create: {
      name: "Allbirds",
      slug: "allbirds",
      domain: "allbirds.com",
      country: "US",
      category: "INTERNATIONAL",
      platformType: "SHOPIFY",
      platformConfidence: 0.95,
      platformSignals: ["cdn.shopify.com", "Shopify.theme", "products.json"],
      shopifyStore: true,
      inventoryTracking: true,
      currency: "USD",
      tags: ["calzado", "sustentable"],
    },
  })

  const pomelo = await prisma.brand.upsert({
    where: { domain: "pomelo.cl" },
    update: {},
    create: {
      name: "Pomelo",
      slug: "pomelo",
      domain: "pomelo.cl",
      country: "CL",
      category: "COMPETITOR",
      platformType: "SHOPIFY",
      platformConfidence: 0.9,
      platformSignals: ["cdn.shopify.com", "products.json"],
      shopifyStore: true,
      inventoryTracking: false,
      currency: "CLP",
      tags: ["ropa", "streetwear"],
    },
  })

  const bsoul = await prisma.brand.upsert({
    where: { domain: "bsoul.cl" },
    update: {},
    create: {
      name: "Bsoul",
      slug: "bsoul",
      domain: "bsoul.cl",
      country: "CL",
      category: "COMPETITOR",
      platformType: "SHOPIFY",
      platformConfidence: 0.88,
      platformSignals: ["cdn.shopify.com", "products.json", "shopify-section"],
      shopifyStore: true,
      inventoryTracking: true,
      currency: "CLP",
      tags: ["skincare", "belleza"],
    },
  })

  console.log(`  ✓ Marcas: ${allbirds.name}, ${pomelo.name}, ${bsoul.name}`)

  // ── 3. Productos y variantes ──
  const productsData = [
    {
      brandId: allbirds.id,
      externalId: "7001",
      title: "Tree Runner",
      handle: "tree-runner",
      productType: "Shoes",
      vendor: "Allbirds",
      firstSeenAt: twoWeeksAgo,
      variants: [
        { externalId: "70011", title: "Size 8", price: 98, option1: "8", sku: "TR-008", isAvailable: true },
        { externalId: "70012", title: "Size 9", price: 98, option1: "9", sku: "TR-009", isAvailable: true },
        { externalId: "70013", title: "Size 10", price: 98, option1: "10", sku: "TR-010", isAvailable: false },
      ],
    },
    {
      brandId: allbirds.id,
      externalId: "7002",
      title: "Wool Piper",
      handle: "wool-piper",
      productType: "Shoes",
      vendor: "Allbirds",
      firstSeenAt: oneWeekAgo,
      isLaunch: true,
      launchDate: oneWeekAgo,
      variants: [
        { externalId: "70021", title: "Size 7", price: 100, option1: "7", sku: "WP-007", isAvailable: true },
        { externalId: "70022", title: "Size 8", price: 100, option1: "8", sku: "WP-008", isAvailable: true },
      ],
    },
    {
      brandId: pomelo.id,
      externalId: "8001",
      title: "Polera Algodón Orgánico",
      handle: "polera-algodon-organico",
      productType: "Poleras",
      vendor: "Pomelo",
      firstSeenAt: twoWeeksAgo,
      variants: [
        { externalId: "80011", title: "S", price: 19990, option1: "S", sku: "POL-S", isAvailable: true },
        { externalId: "80012", title: "M", price: 19990, option1: "M", sku: "POL-M", isAvailable: true },
        { externalId: "80013", title: "L", price: 19990, option1: "L", sku: "POL-L", isAvailable: true },
      ],
    },
    {
      brandId: pomelo.id,
      externalId: "8002",
      title: "Hoodie Oversize",
      handle: "hoodie-oversize",
      productType: "Hoodies",
      vendor: "Pomelo",
      firstSeenAt: oneWeekAgo,
      variants: [
        { externalId: "80021", title: "M", price: 34990, option1: "M", sku: "HOO-M", isAvailable: true },
        { externalId: "80022", title: "L", price: 34990, option1: "L", sku: "HOO-L", isAvailable: false },
      ],
    },
    {
      brandId: bsoul.id,
      externalId: "9001",
      title: "Crema Hidratante",
      handle: "crema-hidratante",
      productType: "Skincare",
      vendor: "Bsoul",
      firstSeenAt: twoWeeksAgo,
      variants: [
        { externalId: "90011", title: "50ml", price: 15990, option1: "50ml", sku: "CRE-50", isAvailable: true },
        { externalId: "90012", title: "100ml", price: 24990, option1: "100ml", sku: "CRE-100", isAvailable: true },
      ],
    },
    {
      brandId: bsoul.id,
      externalId: "9002",
      title: "Sérum Vitamina C",
      handle: "serum-vitamina-c",
      productType: "Skincare",
      vendor: "Bsoul",
      firstSeenAt: oneWeekAgo,
      isLaunch: true,
      launchDate: oneWeekAgo,
      variants: [
        { externalId: "90021", title: "30ml", price: 22990, option1: "30ml", sku: "SER-30", isAvailable: true },
      ],
    },
  ]

  // Inventario por variante: [qtyAyer, qtyHoy]
  const inventoryMap: Record<string, [number, number, boolean, boolean]> = {
    // Allbirds - Tree Runner (cart_probe, trackea inventario)
    "70011": [25, 20, true, true],    // vendió 5
    "70012": [18, 15, true, true],    // vendió 3
    "70013": [3, 0, true, false],     // se agotó
    // Allbirds - Wool Piper
    "70021": [12, 10, true, true],    // vendió 2
    "70022": [8, 6, true, true],      // vendió 2
    // Pomelo - no trackea inventario (available_only, qty=0)
    "80011": [0, 0, true, true],
    "80012": [0, 0, true, true],
    "80013": [0, 0, true, true],
    "80021": [0, 0, true, true],
    "80022": [0, 0, true, false],     // se agotó
    // Bsoul - trackea inventario (cart_probe)
    "90011": [40, 35, true, true],    // vendió 5
    "90012": [22, 22, true, true],    // sin cambio
    "90021": [15, 10, true, true],    // vendió 5
  }

  const allVariantIds: string[] = []

  for (const p of productsData) {
    const product = await prisma.product.upsert({
      where: { brandId_externalId: { brandId: p.brandId, externalId: p.externalId } },
      update: { lastSeenAt: now },
      create: {
        brandId: p.brandId,
        externalId: p.externalId,
        title: p.title,
        handle: p.handle,
        productType: p.productType,
        vendor: p.vendor,
        firstSeenAt: p.firstSeenAt,
        lastSeenAt: now,
        isLaunch: p.isLaunch ?? false,
        launchDate: p.launchDate ?? null,
      },
    })

    for (const v of p.variants) {
      const variant = await prisma.variant.upsert({
        where: { productId_externalId: { productId: product.id, externalId: v.externalId } },
        update: { price: v.price, isAvailable: v.isAvailable },
        create: {
          productId: product.id,
          externalId: v.externalId,
          title: v.title,
          sku: v.sku,
          price: v.price,
          option1: v.option1,
          isAvailable: v.isAvailable,
        },
      })

      allVariantIds.push(variant.id)

      // Snapshots de inventario
      const inv = inventoryMap[v.externalId]
      if (inv) {
        const [qtyYesterday, qtyToday, availYesterday, availToday] = inv
        const isCartProbe = qtyYesterday > 0 || qtyToday > 0

        // Eliminar snapshots previos para idempotencia
        await prisma.inventorySnapshot.deleteMany({ where: { variantId: variant.id } })

        await prisma.inventorySnapshot.createMany({
          data: [
            {
              variantId: variant.id,
              quantity: qtyYesterday,
              isAvailable: availYesterday,
              probeMethod: isCartProbe ? "cart_probe" : "available_only",
              snapshotAt: yesterday,
            },
            {
              variantId: variant.id,
              quantity: qtyToday,
              isAvailable: availToday,
              probeMethod: isCartProbe ? "cart_probe" : "available_only",
              snapshotAt: now,
            },
          ],
        })

        // SalesEstimate para variantes con ventas detectadas (Tier A)
        if (isCartProbe && qtyYesterday > qtyToday) {
          const unitsSold = qtyYesterday - qtyToday
          await prisma.salesEstimate.upsert({
            where: { variantId_date: { variantId: variant.id, date: dateOnly(yesterday) } },
            update: {},
            create: {
              brandId: p.brandId,
              variantId: variant.id,
              date: dateOnly(yesterday),
              unitsSold,
              revenueEstimate: unitsSold * v.price,
              estimationMethod: "cart_probe",
              confidenceScore: 0.9,
            },
          })
        }
      }
    }
  }

  console.log(`  ✓ Productos: ${productsData.length} con variantes y snapshots`)

  // ── 4. Historial de precios ──
  // Eliminar historial previo del seed para idempotencia
  await prisma.priceHistory.deleteMany({
    where: { variantId: { in: allVariantIds } },
  })

  // Buscar variantes por externalId para vincular historial
  const trSize8 = await prisma.variant.findFirst({ where: { externalId: "70011" } })
  const crema100 = await prisma.variant.findFirst({ where: { externalId: "90012" } })

  const priceHistoryData = []
  if (trSize8) {
    // Tree Runner Size 8 bajó de $110 a $98
    priceHistoryData.push(
      { variantId: trSize8.id, price: 110.00, recordedAt: twoWeeksAgo },
      { variantId: trSize8.id, price: 98.00, recordedAt: oneWeekAgo },
    )
  }
  if (crema100) {
    // Crema Hidratante 100ml subió de $22990 a $24990
    priceHistoryData.push(
      { variantId: crema100.id, price: 22990, recordedAt: twoWeeksAgo },
      { variantId: crema100.id, price: 24990, recordedAt: twoDaysAgo },
    )
  }

  if (priceHistoryData.length > 0) {
    await prisma.priceHistory.createMany({ data: priceHistoryData })
  }
  console.log(`  ✓ Historial de precios: ${priceHistoryData.length} registros`)

  // ── 5. Tasas de cambio ──
  const effectiveDate = dateOnly(now)

  // Eliminar rates previos del seed para idempotencia
  await prisma.exchangeRate.deleteMany({
    where: { source: "seed", effectiveDate },
  })

  const rates = [
    { fromCurrency: "USD", toCurrency: "CLP", rate: 950 },
    { fromCurrency: "EUR", toCurrency: "CLP", rate: 1050 },
    { fromCurrency: "USD", toCurrency: "EUR", rate: 0.92 },
    { fromCurrency: "CLP", toCurrency: "USD", rate: 0.00105 },
    { fromCurrency: "MXN", toCurrency: "USD", rate: 0.058 },
    { fromCurrency: "BRL", toCurrency: "USD", rate: 0.17 },
    { fromCurrency: "GBP", toCurrency: "USD", rate: 1.27 },
    { fromCurrency: "COP", toCurrency: "USD", rate: 0.00024 },
    { fromCurrency: "ARS", toCurrency: "USD", rate: 0.00088 },
  ]

  await prisma.exchangeRate.createMany({
    data: rates.map((r) => ({ ...r, effectiveDate, source: "seed" })),
  })
  console.log(`  ✓ Tasas de cambio: ${rates.length}`)

  // ── 6. ScrapeJobs completados (1-2 por marca) ──
  // Eliminar scrape jobs previos del seed para idempotencia
  for (const brand of [allbirds, pomelo, bsoul]) {
    await prisma.scrapeJob.deleteMany({ where: { brandId: brand.id } })
  }

  await prisma.scrapeJob.createMany({
    data: [
      // Allbirds - 2 jobs
      {
        brandId: allbirds.id,
        type: "SHOPIFY_FULL",
        status: "COMPLETED",
        startedAt: twoWeeksAgo,
        completedAt: new Date(twoWeeksAgo.getTime() + 45000),
        productsFound: 2,
        variantsFound: 5,
        createdAt: twoWeeksAgo,
      },
      {
        brandId: allbirds.id,
        type: "SHOPIFY_INCREMENTAL",
        status: "COMPLETED",
        startedAt: yesterday,
        completedAt: new Date(yesterday.getTime() + 12000),
        productsFound: 2,
        variantsFound: 5,
        createdAt: yesterday,
      },
      // Pomelo - 1 job
      {
        brandId: pomelo.id,
        type: "SHOPIFY_FULL",
        status: "COMPLETED",
        startedAt: oneWeekAgo,
        completedAt: new Date(oneWeekAgo.getTime() + 30000),
        productsFound: 2,
        variantsFound: 5,
        createdAt: oneWeekAgo,
      },
      // Bsoul - 2 jobs
      {
        brandId: bsoul.id,
        type: "SHOPIFY_FULL",
        status: "COMPLETED",
        startedAt: twoWeeksAgo,
        completedAt: new Date(twoWeeksAgo.getTime() + 25000),
        productsFound: 2,
        variantsFound: 3,
        createdAt: twoWeeksAgo,
      },
      {
        brandId: bsoul.id,
        type: "SHOPIFY_INCREMENTAL",
        status: "COMPLETED",
        startedAt: yesterday,
        completedAt: new Date(yesterday.getTime() + 8000),
        productsFound: 2,
        variantsFound: 3,
        createdAt: yesterday,
      },
    ],
  })
  console.log("  ✓ ScrapeJobs: 5 completados")

  // ── 7. Alertas por defecto para cada marca ──
  for (const brand of [allbirds, pomelo, bsoul]) {
    const existingAlerts = await prisma.brandAlert.count({ where: { brandId: brand.id } })
    if (existingAlerts === 0) {
      await prisma.brandAlert.createMany({
        data: DEFAULT_ALERT_TYPES.map((a) => ({
          brandId: brand.id,
          type: a.type,
          threshold: a.threshold,
          isActive: true,
        })),
      })
    }
  }
  console.log("  ✓ Alertas: 10 tipos x 3 marcas")

  // ── 8. Eventos de alerta (AlertEvent) ──
  const allbirdsAlerts = await prisma.brandAlert.findMany({ where: { brandId: allbirds.id } })
  const bsoulAlerts = await prisma.brandAlert.findMany({ where: { brandId: bsoul.id } })

  const priceDropAlert = allbirdsAlerts.find((a) => a.type === "PRICE_DROP")
  const newProductAlert = allbirdsAlerts.find((a) => a.type === "NEW_PRODUCTS")
  const bsoulPriceAlert = bsoulAlerts.find((a) => a.type === "PRICE_CHANGE")

  // Limpiar eventos previos para idempotencia
  for (const alert of [priceDropAlert, newProductAlert, bsoulPriceAlert]) {
    if (alert) {
      await prisma.alertEvent.deleteMany({ where: { alertId: alert.id } })
    }
  }

  if (priceDropAlert) {
    await prisma.alertEvent.create({
      data: {
        alertId: priceDropAlert.id,
        message: "Tree Runner bajó de $110 a $98 USD (-10.9%)",
        data: {
          productTitle: "Tree Runner",
          variantTitle: "Size 8",
          oldPrice: 110,
          newPrice: 98,
          changePercent: -10.9,
        },
        triggeredAt: oneWeekAgo,
        isRead: false,
      },
    })
  }

  if (newProductAlert) {
    await prisma.alertEvent.create({
      data: {
        alertId: newProductAlert.id,
        message: "Nuevo producto detectado: Wool Piper (2 variantes)",
        data: {
          productTitle: "Wool Piper",
          variantCount: 2,
          handle: "wool-piper",
        },
        triggeredAt: oneWeekAgo,
        isRead: true,
      },
    })
  }

  if (bsoulPriceAlert) {
    await prisma.alertEvent.create({
      data: {
        alertId: bsoulPriceAlert.id,
        message: "Crema Hidratante 100ml subió de $22.990 a $24.990 CLP (+8.7%)",
        data: {
          productTitle: "Crema Hidratante",
          variantTitle: "100ml",
          oldPrice: 22990,
          newPrice: 24990,
          changePercent: 8.7,
        },
        triggeredAt: twoDaysAgo,
        isRead: false,
      },
    })
  }

  console.log("  ✓ Eventos de alerta: 3 registros")

  console.log("\nSeed completo!")
  console.log("  Login: admin@particula.cl / admin123")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
