import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { detectShopifyStore } from "@/lib/scrapers/shopify"
import { detectPlatform } from "@/lib/detectors/platform-detector"
import { scrapeBrand } from "@/lib/pipeline/scrape-brand"
import { createDefaultAlerts } from "@/lib/pipeline/alerts"

const createBrandSchema = z.object({
  name: z.string().min(1).max(100),
  domain: z.string().min(3),
  country: z.string().optional(),
  category: z.enum(["COMPETITOR", "ASPIRATIONAL", "INTERNATIONAL", "ADJACENT", "MY_BRAND"]).default("COMPETITOR"),
  isMyBrand: z.boolean().default(false),
  notes: z.string().optional(),
})

// GET /api/brands — list all brands
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get("category")
  const isActive = searchParams.get("isActive")

  const brands = await prisma.brand.findMany({
    where: {
      ...(category ? { category: category as never } : {}),
      ...(isActive !== null ? { isActive: isActive === "true" } : {}),
    },
    orderBy: [{ isMyBrand: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { products: true } },
      scrapeJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, completedAt: true, createdAt: true },
      },
    },
  })

  return NextResponse.json(brands)
}

// POST /api/brands — create new brand
export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = createBrandSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { name, domain, country, category, isMyBrand, notes } = parsed.data

  // Normalizar dominio (quitar https://, www., trailing slash)
  const cleanDomain = domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .toLowerCase()

  // Verificar que no existe ya
  const existing = await prisma.brand.findUnique({ where: { domain: cleanDomain } })
  if (existing) {
    return NextResponse.json({ error: "Esta marca ya está siendo trackeada" }, { status: 409 })
  }

  // Detectar plataforma ecommerce
  const detection = await detectPlatform(cleanDomain)
  const isShopify = detection.platform === "SHOPIFY" && detection.confidence >= 0.5

  // Fallback: si no se detectó Shopify por señales HTML pero el endpoint responde
  const shopifyConfirmed = isShopify || await detectShopifyStore(cleanDomain)

  // Generar slug
  const slug = cleanDomain.replace(/\./g, "-").replace(/[^a-z0-9-]/g, "")

  const brand = await prisma.brand.create({
    data: {
      name,
      slug,
      domain: cleanDomain,
      country: country?.toUpperCase() ?? null,
      category,
      isMyBrand,
      shopifyStore: shopifyConfirmed,
      platformType: detection.platform,
      platformConfidence: detection.confidence,
      platformSignals: detection.signals as never,
      notes: notes ?? null,
      isActive: true,
    },
  })

  // Crear alertas por defecto
  await createDefaultAlerts(brand.id)

  // Registrar el scrape job en DB
  const scrapeJob = await prisma.scrapeJob.create({
    data: {
      brandId: brand.id,
      type: shopifyConfirmed ? "SHOPIFY_FULL" : "PLAYWRIGHT",
      status: "PENDING",
    },
  })

  // Ejecutar scraping en background (no bloquea la respuesta)
  if (shopifyConfirmed) {
    after(async () => {
      await scrapeBrand(brand.id)
    })
  }

  return NextResponse.json(
    {
      ...brand,
      scrapeJobId: scrapeJob.id,
      shopifyDetected: shopifyConfirmed,
      platformDetection: detection,
    },
    { status: 201 }
  )
}
