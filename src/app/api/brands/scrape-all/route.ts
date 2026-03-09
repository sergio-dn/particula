/**
 * @swagger
 * /api/brands/scrape-all:
 *   post:
 *     summary: Trigger scraping para todas las marcas activas
 *     tags: [Brands]
 *     responses:
 *       200:
 *         description: Scrape jobs creados
 */
import { NextResponse } from "next/server"
import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { scrapeBrand } from "@/lib/pipeline/scrape-brand"
import { requireRole } from "@/lib/auth-guard"

export async function POST() {
  const { error } = await requireRole("ADMIN")
  if (error) return error

  const brands = await prisma.brand.findMany({
    where: { isActive: true, shopifyStore: true },
    select: { id: true, domain: true },
  })

  // Crear jobs para todas las marcas
  const jobs = await Promise.all(
    brands.map((b) =>
      prisma.scrapeJob.create({
        data: {
          brandId: b.id,
          type: "SHOPIFY_FULL",
          status: "PENDING",
        },
      })
    )
  )

  // Ejecutar scraping secuencial en background (evita saturar conexiones)
  after(async () => {
    for (const brand of brands) {
      try {
        await scrapeBrand(brand.id)
      } catch (err) {
        console.error(`[scrape-all] error for ${brand.domain}:`, err)
      }
      // Pausa entre marcas para no saturar
      await new Promise((r) => setTimeout(r, 2000))
    }
  })

  return NextResponse.json({
    message: `Scraping iniciado para ${brands.length} marcas`,
    jobIds: jobs.map((j) => j.id),
  })
}
