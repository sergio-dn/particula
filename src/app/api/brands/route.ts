/**
 * @swagger
 * /api/brands:
 *   get:
 *     summary: Listar marcas
 *     tags: [Brands]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array de marcas
 *   post:
 *     summary: Crear marca
 *     tags: [Brands]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, domain]
 *             properties:
 *               name: { type: string }
 *               domain: { type: string }
 *     responses:
 *       201:
 *         description: Marca creada
 *       403:
 *         description: Permisos insuficientes
 */
import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { revalidateTag } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { detectPlatform } from "@/lib/detectors/platform-detector"
import { scrapeBrand } from "@/lib/pipeline/scrape-brand"
import { createDefaultAlerts } from "@/lib/pipeline/alerts"
import { requireRole } from "@/lib/auth-guard"

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
  const { error } = await requireRole("VIEWER")
  if (error) return error

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
  const { error } = await requireRole("EDITOR")
  if (error) return error

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

  // Auto-detectar si es Shopify
  // Auto-detectar plataforma
  const detection = await detectPlatform(cleanDomain)
  const isShopify = detection.platform === "SHOPIFY"

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
      shopifyStore: isShopify,
      platformType: detection.platform,
      platformConfidence: detection.confidence,
      platformSignals: detection.signals.filter((s) => s.found).map((s) => s.signal),
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
      type: isShopify ? "SHOPIFY_FULL" : "PLAYWRIGHT",
      status: "PENDING",
    },
  })

  // Ejecutar scraping en background con retry
  if (isShopify) {
    after(async () => {
      try {
        const result = await scrapeBrand(brand.id)
        if (result.status === "FAILED" && result.error?.includes("fetch")) {
          console.log(`[scrape] retrying ${brand.domain} after fetch failure`)
          await new Promise((r) => setTimeout(r, 5000))
          await scrapeBrand(brand.id)
        }
      } catch (err) {
        console.error(`[scrape] unhandled error for ${brand.domain}:`, err)
      }
    })
  }

  revalidateTag("brands")
  revalidateTag("dashboard-stats")

  return NextResponse.json(
    { ...brand, scrapeJobId: scrapeJob.id, shopifyDetected: isShopify, platformDetection: { platform: detection.platform, confidence: detection.confidence } },
    { status: 201 }
  )
}
